package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/editions"
	"github.com/xibolun/bible/internal/importer"
	"github.com/xibolun/bible/internal/storage"
)

type EditionChoice struct {
	Token     string `json:"token"`
	Name      string `json:"name"`
	Cancelled bool   `json:"cancelled"`
}
type EditionImportProblem struct {
	Code     string `json:"code"`
	Position string `json:"position"`
}
type EditionImportJob struct {
	ID        string                `json:"id"`
	Status    string                `json:"status"`
	Report    *importer.Draft       `json:"report,omitempty"`
	Samples   []importer.Record     `json:"samples"`
	Problem   *EditionImportProblem `json:"problem,omitempty"`
	Installed *editions.Installed   `json:"installed,omitempty"`
}
type importJob struct {
	view     EditionImportJob
	draft    *importer.Draft
	expires  time.Time
	cancel   context.CancelFunc
	filename string
	name     string
}
type editionManager struct {
	mu       sync.Mutex
	library  *editions.Library
	root     string
	job      *importJob
	choosing bool
	workers  sync.WaitGroup
	closing  bool
}
type editionFileHost interface{ ChooseEditionFile() (string, error) }

func NewWithEditions(data *bible.Dataset, store *storage.Store, desktop Desktop, library *editions.Library, root string) *Service {
	s := New(data, store, desktop)
	s.editions = &editionManager{library: library, root: root}
	if library != nil {
		data.Provider = library
		_ = s.finishEditionRemovals()
	}
	return s
}
func importFailure[T any](err error) Result[T] {
	code, position := importer.Describe(err)
	if _, ok := err.(*importer.Problem); !ok {
		switch err.Error() {
		case "INVALID_TRANSLATION", "INVALID_SETTINGS", "DATA_UNAVAILABLE":
			code = err.Error()
		}
	}
	r := failure[T](code)
	if position != "" {
		r.Error.Message += " · " + position
	}
	return r
}
func (s *Service) ListEditionInstalls() Result[[]editions.Install] {
	if s.editions == nil || s.editions.library == nil {
		return failure[[]editions.Install]("EDITION_LIBRARY_UNAVAILABLE")
	}
	return success(s.editions.library.List())
}

func (s *Service) ChooseEditionImport() Result[EditionChoice] {
	m := s.editions
	if m == nil || m.library == nil {
		return failure[EditionChoice]("EDITION_LIBRARY_UNAVAILABLE")
	}
	host, ok := s.Desktop.(editionFileHost)
	if !ok {
		return failure[EditionChoice]("BRIDGE_UNAVAILABLE")
	}
	m.mu.Lock()
	if m.closing || m.choosing || m.job != nil && (m.job.view.Status == "inspecting" || m.job.view.Status == "committing") {
		m.mu.Unlock()
		return failure[EditionChoice]("IMPORT_BUSY")
	}
	m.choosing = true
	m.mu.Unlock()
	defer func() { m.mu.Lock(); m.choosing = false; m.mu.Unlock() }()
	filename, err := host.ChooseEditionFile()
	if err != nil {
		return failure[EditionChoice]("IMPORT_IO")
	}
	if filename == "" {
		return success(EditionChoice{Cancelled: true})
	}
	in, err := os.Open(filename)
	if err != nil {
		return failure[EditionChoice]("IMPORT_IO")
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return failure[EditionChoice]("INVALID_CONTENT")
	}
	if info.Size() > importer.MaxFile {
		return failure[EditionChoice]("IMPORT_LIMIT")
	}
	if err = os.MkdirAll(m.root, 0700); err != nil {
		return failure[EditionChoice]("IMPORT_IO")
	}
	out, err := os.CreateTemp(m.root, "input-*")
	if err != nil {
		return failure[EditionChoice]("IMPORT_IO")
	}
	n, err := io.Copy(out, io.LimitReader(in, importer.MaxFile+1))
	closeErr := out.Close()
	if err != nil || closeErr != nil || n > importer.MaxFile {
		_ = os.Remove(out.Name())
		return failure[EditionChoice]("IMPORT_IO")
	}
	_, cancel := context.WithCancel(context.Background())
	id := rand.Text()
	job := &importJob{view: EditionImportJob{ID: id, Status: "queued", Samples: []importer.Record{}}, expires: time.Now().Add(30 * time.Minute), filename: out.Name(), name: filepath.Base(filename), cancel: cancel}
	if err = m.library.SaveJob(id, "queued", job.view); err != nil {
		cancel()
		_ = os.Remove(out.Name())
		return failure[EditionChoice]("IMPORT_IO")
	}
	m.mu.Lock()
	if m.job != nil {
		m.job.cancel()
		if m.job.filename != "" {
			_ = os.Remove(m.job.filename)
		}
		m.job.draft = nil
		m.job.view.Report = nil
	}
	m.job = job
	m.mu.Unlock()
	return success(EditionChoice{Token: id, Name: job.name})
}
func publicJob(job *importJob) EditionImportJob {
	v := job.view
	v.Samples = slices.Clone(v.Samples)
	if v.Report != nil {
		copy := *v.Report
		copy.Records = nil
		v.Report = &copy
	}
	return v
}
func (s *Service) InspectEditionImport(token string) Result[EditionImportJob] {
	m := s.editions
	if m == nil || m.library == nil {
		return failure[EditionImportJob]("EDITION_LIBRARY_UNAVAILABLE")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.job
	if m.closing {
		return failure[EditionImportJob]("BRIDGE_UNAVAILABLE")
	}
	if j == nil || j.view.ID != token || time.Now().After(j.expires) {
		return failure[EditionImportJob]("DRAFT_EXPIRED")
	}
	if j.view.Status != "queued" {
		return success(publicJob(j))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	j.cancel()
	j.cancel = cancel
	j.view.Status = "inspecting"
	if err := m.library.SaveJob(j.view.ID, j.view.Status, j.view); err != nil {
		cancel()
		j.view.Status = "failed"
		return failure[EditionImportJob]("IMPORT_IO")
	}
	filename, name := j.filename, j.name
	m.workers.Add(1)
	go func() {
		defer m.workers.Done()
		defer cancel()
		d, err := importer.Parse(ctx, filename, name, s.Data)
		_ = os.Remove(filename)
		m.mu.Lock()
		defer m.mu.Unlock()
		if j.view.Status == "cancelled" {
			return
		}
		j.filename = ""
		if err != nil {
			code, pos := importer.Describe(err)
			j.view.Status = "failed"
			j.view.Problem = &EditionImportProblem{code, pos}
		} else {
			j.draft = d
			j.view.Report = d
			j.view.Status = "ready"
			for i, r := range d.Records {
				if r.Text != "" {
					j.view.Samples = append(j.view.Samples, r)
				}
				if len(j.view.Samples) == 5 || i > 1000 {
					break
				}
			}
		}
		if err = m.library.SaveJob(j.view.ID, j.view.Status, publicJob(j)); err != nil {
			j.draft = nil
			j.view.Status = "failed"
			j.view.Problem = &EditionImportProblem{"IMPORT_IO", ""}
		}
	}()
	return success(publicJob(j))
}
func (s *Service) GetEditionImportJob(id string) Result[EditionImportJob] {
	m := s.editions
	if m == nil {
		return failure[EditionImportJob]("EDITION_LIBRARY_UNAVAILABLE")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.job
	if j == nil || j.view.ID != id {
		return failure[EditionImportJob]("DRAFT_EXPIRED")
	}
	if time.Now().After(j.expires) && j.view.Status != "committing" {
		j.cancel()
		j.draft = nil
		j.view.Report = nil
		j.view.Status = "failed"
		j.view.Problem = &EditionImportProblem{"DRAFT_EXPIRED", ""}
		if j.filename != "" {
			_ = os.Remove(j.filename)
			j.filename = ""
		}
	}
	return success(publicJob(j))
}
func (s *Service) CancelEditionImport(id string) Result[EditionImportJob] {
	m := s.editions
	if m == nil {
		return failure[EditionImportJob]("EDITION_LIBRARY_UNAVAILABLE")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	j := m.job
	if j == nil || j.view.ID != id {
		return failure[EditionImportJob]("DRAFT_EXPIRED")
	}
	if j.view.Status == "committing" || j.view.Status == "done" {
		return success(publicJob(j))
	}
	j.cancel()
	j.draft = nil
	j.view.Report = nil
	j.view.Status = "cancelled"
	if j.filename != "" {
		_ = os.Remove(j.filename)
		j.filename = ""
	}
	if err := m.library.SaveJob(id, j.view.Status, publicJob(j)); err != nil {
		return failure[EditionImportJob]("IMPORT_IO")
	}
	return success(publicJob(j))
}
func (s *Service) CommitEditionImport(id string, options editions.Commit) Result[EditionImportJob] {
	m := s.editions
	if m == nil || m.library == nil {
		return failure[EditionImportJob]("EDITION_LIBRARY_UNAVAILABLE")
	}
	m.mu.Lock()
	j := m.job
	if j == nil || j.view.ID != id || time.Now().After(j.expires) {
		m.mu.Unlock()
		return failure[EditionImportJob]("DRAFT_EXPIRED")
	}
	if j.view.Status == "done" {
		out := publicJob(j)
		m.mu.Unlock()
		return success(out)
	}
	if j.view.Status != "ready" || j.draft == nil {
		m.mu.Unlock()
		return failure[EditionImportJob]("IMPORT_BUSY")
	}
	j.view.Status = "committing"
	if err := m.library.SaveJob(id, "committing", publicJob(j)); err != nil {
		j.view.Status = "ready"
		m.mu.Unlock()
		return failure[EditionImportJob]("IMPORT_IO")
	}
	d := j.draft
	m.mu.Unlock()
	s.editionOps.Lock()
	installed, err := m.library.Install(d, options)
	s.editionOps.Unlock()
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		j.view.Status = "ready"
		_ = m.library.SaveJob(id, "ready", publicJob(j))
		return importFailure[EditionImportJob](err)
	}
	j.view.Status = "done"
	j.view.Installed = &installed
	j.draft = nil
	j.view.Report = nil
	// Commit is the source of truth even if writing the job summary later fails.
	_ = m.library.SaveJob(id, "done", publicJob(j))
	return success(publicJob(j))
}
func (s *Service) SetEditionEnabled(id string, enabled bool) Result[bool] {
	s.editionOps.Lock()
	defer s.editionOps.Unlock()
	if s.editions == nil || s.editions.library == nil {
		return failure[bool]("EDITION_LIBRARY_UNAVAILABLE")
	}
	if err := s.editions.library.SetEnabled(id, enabled); err != nil {
		return importFailure[bool](err)
	}
	return s.repairEditionPreferences()
}
func (s *Service) RestoreEditionVersion(id, version string) Result[bool] {
	s.editionOps.Lock()
	defer s.editionOps.Unlock()
	if s.editions == nil || s.editions.library == nil {
		return failure[bool]("EDITION_LIBRARY_UNAVAILABLE")
	}
	if err := s.editions.library.Restore(id, version); err != nil {
		return importFailure[bool](err)
	}
	return s.repairEditionPreferences()
}
func (s *Service) RemoveEdition(id string, purgeHighlights bool) Result[bool] {
	s.editionOps.Lock()
	defer s.editionOps.Unlock()
	if s.editions == nil || s.editions.library == nil {
		return failure[bool]("EDITION_LIBRARY_UNAVAILABLE")
	}
	if err := s.editions.library.BeginRemoval(id, purgeHighlights); err != nil {
		return importFailure[bool](err)
	}
	if err := s.finishEditionRemovals(); err != nil {
		return failure[bool]("STORAGE_ERROR")
	}
	return s.repairEditionPreferences()
}

func (s *Service) finishEditionRemovals() error {
	pending, err := s.editions.library.PendingRemovals()
	if err != nil {
		return err
	}
	for _, r := range pending {
		if r.Purge {
			if s.Store == nil {
				return fmt.Errorf("STORAGE_ERROR")
			}
			if err = s.Store.DeleteEditionHighlights(r.ID); err != nil {
				return err
			}
		}
		if err = s.editions.library.Remove(r.ID); err != nil {
			return err
		}
	}
	return nil
}

// Source-version annotations are deliberately retained. The matching tombstone
// ID is reused if the user imports the same text again.
func (s *Service) sanitizeEditionReferences(p *Preferences) {
	ids := []string{}
	for _, id := range p.Translations {
		if _, ok := s.Data.Translation(id); ok && !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		ids = []string{s.Data.Translations[0].ID}
	}
	p.Translations = ids
	for _, id := range ids {
		if t, _ := s.Data.Translation(id); t.Origin == "user" && !t.Comparable {
			p.Parallel = false
		}
	}
	active := ids
	if !p.Parallel {
		active = ids[:1]
	}
	books, err := s.Data.AvailableBooks(active)
	if err == nil && len(books) > 0 {
		i := slices.IndexFunc(books, func(b bible.Book) bool { return b.ID == p.BookID })
		if i < 0 {
			i = 0
			p.BookID = books[0].ID
			p.Chapter = 1
			p.TopVerse = ""
			p.ScrollOffset = 0
		}
		b := books[i]
		if p.Chapter < 1 || p.Chapter > b.Chapters || len(b.ChapterNumbers) > 0 && !slices.Contains(b.ChapterNumbers, p.Chapter) {
			p.Chapter = 1
			if len(b.ChapterNumbers) > 0 {
				p.Chapter = b.ChapterNumbers[0]
			}
			p.TopVerse = ""
			p.ScrollOffset = 0
		}
	}
	history := []SearchHistoryEntry{}
	for _, e := range p.SearchHistory {
		if _, ok := s.Data.Translation(e.TranslationID); ok {
			history = append(history, e)
		}
	}
	p.SearchHistory = history
}
func (s *Service) repairEditionPreferences() Result[bool] {
	if s.Store == nil {
		return failure[bool]("STORAGE_ERROR")
	}
	p := Defaults()
	if err := s.Store.Preferences(&p); err != nil {
		return failure[bool]("STORAGE_ERROR")
	}
	s.sanitizeEditionReferences(&p)
	return s.SavePreferences(p)
}

// Cleanup is used by the application host at shutdown, not exposed to Wails.
func CleanupEditionInputs(root string) error {
	if root == "" || filepath.Base(root) != "imports" {
		return fmt.Errorf("invalid import staging root")
	}
	files, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, file := range files {
		info, e := file.Info()
		if e != nil {
			return e
		}
		if !info.Mode().IsRegular() || time.Since(info.ModTime()) < time.Hour {
			continue
		}
		if strings.HasPrefix(file.Name(), "input-") || strings.HasPrefix(file.Name(), "unpacked-") {
			if e = os.Remove(filepath.Join(root, file.Name())); e != nil {
				return e
			}
		}
	}
	return nil
}

func CloseEditionInputs(s *Service) {
	if s.editions == nil {
		return
	}
	m := s.editions
	m.mu.Lock()
	m.closing = true
	if m.job != nil {
		m.job.cancel()
		m.job.draft = nil
		m.job.view.Report = nil
	}
	m.mu.Unlock()
	m.workers.Wait()
	m.mu.Lock()
	if m.job != nil && m.job.filename != "" {
		_ = os.Remove(m.job.filename)
	}
	m.mu.Unlock()
}
