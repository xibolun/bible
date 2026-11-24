package service

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/editions"
	"github.com/xibolun/bible/internal/storage"
)

type editionDesktop struct {
	fakeDesktop
	filename string
}

func (d *editionDesktop) ChooseEditionFile() (string, error) { return d.filename, nil }
func importFixture(t *testing.T, s *Service, desk *editionDesktop, body, replace string) string {
	t.Helper()
	return importFixtureWithCompression(t, s, desk, body, replace, false)
}

func importFixtureWithCompression(t *testing.T, s *Service, desk *editionDesktop, body, replace string, compressed bool) string {
	t.Helper()
	name := "fixture.xml"
	content := []byte(`<XMLBIBLE biblename="Synthetic"><INFORMATION><rights>CC0 self-authored test fixture</rights></INFORMATION><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="3" e="4">` + body + `</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`)
	if compressed {
		var buffer bytes.Buffer
		w := gzip.NewWriter(&buffer)
		w.Name = name
		if _, err := w.Write(content); err != nil {
			t.Fatal(err)
		}
		if err := w.Close(); err != nil {
			t.Fatal(err)
		}
		name += ".gz"
		content = buffer.Bytes()
	}
	file := filepath.Join(t.TempDir(), name)
	if e := os.WriteFile(file, content, 0600); e != nil {
		t.Fatal(e)
	}
	desk.filename = file
	choice := s.ChooseEditionImport()
	if !choice.OK {
		t.Fatal(choice.Error)
	}
	encoded, _ := json.Marshal(choice)
	if strings.Contains(string(encoded), t.TempDir()) || strings.Contains(string(encoded), file) {
		t.Fatal("private input path exposed")
	}
	if e := os.Remove(file); e != nil {
		t.Fatal(e)
	}
	start := s.InspectEditionImport(choice.Data.Token)
	if !start.OK {
		t.Fatal(start.Error)
	}
	deadline := time.Now().Add(5 * time.Second)
	var job EditionImportJob
	for time.Now().Before(deadline) {
		r := s.GetEditionImportJob(choice.Data.Token)
		if !r.OK {
			t.Fatal(r.Error)
		}
		job = *r.Data
		if job.Status == "ready" || job.Status == "failed" {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if job.Status != "ready" || job.Report == nil {
		t.Fatalf("inspection failed: %#v", job)
	}
	if len(job.Report.Records) != 0 || job.Samples[0].Label != "3-4" {
		t.Fatal("preview payload wrong")
	}
	commit := s.CommitEditionImport(job.ID, editions.Commit{Name: "Synthetic", Abbreviation: "SYN", Language: "zh", ReplaceID: replace})
	if !commit.OK || commit.Data.Status != "done" {
		t.Fatalf("commit failed: %#v", commit.Error)
	}
	return commit.Data.Installed.ID
}
func TestImportedEditionUsesAllNativeServicesAndPreservesAnnotations(t *testing.T) {
	root := t.TempDir()
	data, e := bible.Load()
	if e != nil {
		t.Fatal(e)
	}
	lib, e := editions.Open(filepath.Join(root, "editions.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer lib.Close()
	store, e := storage.Open(filepath.Join(root, "user.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	desk := &editionDesktop{}
	s := NewWithEditions(data, store, desk, lib, filepath.Join(root, "imports"))
	defer CloseEditionInputs(s)
	id := importFixtureWithCompression(t, s, desk, "晨光照耀。[补词]<BR/>第二行。", "", true)
	ts := s.ListTranslations()
	if !ts.OK || len(*ts.Data) != 2 {
		t.Fatal("catalogue not refreshed")
	}
	books := s.ListBooks([]string{id})
	if !books.OK || len(*books.Data) != 1 || (*books.Data)[0].ID != "JHN" || (*books.Data)[0].ChapterNumbers[0] != 3 {
		t.Fatal("partial edition requires Genesis", books.Error)
	}
	chapter := s.GetChapter([]string{id}, "JHN", 3, "import")
	if !chapter.OK || len(chapter.Data.Rows) != 1 || chapter.Data.Rows[0].Label != "3-4" {
		t.Fatal("lost combined verse", chapter.Error)
	}
	if s.GetChapter([]string{id, "cuv"}, "JHN", 3, "").OK {
		t.Fatal("unverified numbering silently aligned")
	}
	search := s.SearchScripture(id, "晨%照", 0, 20)
	if !search.OK || search.Data.Total != 1 || search.Data.Results[0].VerseKey != "3-4" {
		t.Fatal("search did not use imported corpus")
	}
	tr, _ := data.Translation(id)
	body := chapter.Data.Rows[0].Cells[0].Text
	sel := Selection{TranslationID: id, DataVersion: tr.DataVersion, BookID: "JHN", Chapter: 3, Spans: []Span{{VerseKey: "3-4", Start: 0, End: utf8.RuneCountInString(body)}}}
	if r := s.ApplyHighlight("import-mark-1", sel, "green"); !r.OK || len(*r.Data) != 1 {
		t.Fatal("highlight failed", r.Error)
	}
	if !s.CopySelection(sel, "textWithReference", []string{id}, CopyOptions{}).OK || !strings.Contains(desk.text, body) {
		t.Fatal("copy failed")
	}
	if card := s.GetCard(sel, []string{id}, true, CopyOptions{}); !card.OK || card.Data.Lines[0].Text != body {
		t.Fatal("card failed", card.Error)
	}
	projected := s.SetProjection("JHN3:3", id, DefaultProjectionStyle())
	if !projected.OK || projected.Data.Passage.Verses[0].Label != "3-4" {
		t.Fatal("projection lost actual source range", projected.Error)
	}
	p := Defaults()
	p.Translations = []string{id}
	p.BookID = "JHN"
	p.Chapter = 3
	p.GlobalFontSize = 20
	p.SearchHistory = []SearchHistoryEntry{{TranslationID: id, Pattern: "晨%照"}}
	if !s.SavePreferences(p).OK {
		t.Fatal("partial edition settings failed")
	}
	if !s.SetEditionEnabled(id, false).OK {
		t.Fatal("disable failed")
	}
	prefs := s.GetPreferences()
	if !prefs.OK || prefs.Data.Translations[0] != "cuv" || len(prefs.Data.SearchHistory) != 0 || prefs.Data.GlobalFontSize != 20 {
		t.Fatal("unavailable edition broke settings", prefs.Error)
	}
	if s.GetProjection().Data.Revision != projected.Data.Revision {
		t.Fatal("disabling changed audience")
	}
	if !s.SetEditionEnabled(id, true).OK {
		t.Fatal("enable failed")
	}
	if got := importFixture(t, s, desk, "新的一版。", id); got != id {
		t.Fatal("replacement identity changed")
	}
	if marks := s.ListHighlights([]string{id}, "JHN", 3); !marks.OK || len(*marks.Data) != 0 {
		t.Fatal("old offsets attached to changed text")
	}
	if !s.RestoreEditionVersion(id, tr.DataVersion).OK {
		t.Fatal("restore failed")
	}
	if marks := s.ListHighlights([]string{id}, "JHN", 3); !marks.OK || len(*marks.Data) != 1 {
		t.Fatal("restore lost original annotations")
	}
	if !s.RemoveEdition(id, false).OK {
		t.Fatal("remove failed")
	}
	if got := importFixture(t, s, desk, "晨光照耀。[补词]<BR/>第二行。", ""); got != id {
		t.Fatal("reimport did not recover annotation identity")
	}
	if marks := s.ListHighlights([]string{id}, "JHN", 3); !marks.OK || len(*marks.Data) != 1 {
		t.Fatal("reimport lost highlights")
	}
	if !s.RemoveEdition(id, true).OK {
		t.Fatal("purge failed")
	}
	marks, _ := store.Highlights("JHN", 3)
	if len(marks) != 0 {
		t.Fatal("requested purge retained annotations")
	}
	contents, err := os.ReadFile(filepath.Join(root, "editions.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(contents), "晨光照耀") {
		t.Fatal("removed scripture remained in the import job preview cache")
	}
}
func TestInterruptedEditionPurgeResumesAfterRestart(t *testing.T) {
	root := t.TempDir()
	data, err := bible.Load()
	if err != nil {
		t.Fatal(err)
	}
	store, err := storage.Open(filepath.Join(root, "user.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	path := filepath.Join(root, "editions.sqlite")
	lib, err := editions.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	desk := &editionDesktop{}
	s := NewWithEditions(data, store, desk, lib, filepath.Join(root, "imports"))
	id := importFixture(t, s, desk, "Synthetic recovery fixture.", "")
	tr, _ := data.Translation(id)
	sel := Selection{TranslationID: id, DataVersion: tr.DataVersion, BookID: "JHN", Chapter: 3, Spans: []Span{{VerseKey: "3-4", Start: 0, End: 9}}}
	if r := s.ApplyHighlight("recovery-mark", sel, "green"); !r.OK {
		t.Fatal(r.Error)
	}
	// Simulate the annotation store being unavailable after durable intent was
	// recorded, before either store has finished deleting the edition.
	s.Store = nil
	if r := s.RemoveEdition(id, true); r.OK || r.Error.Code != "STORAGE_ERROR" {
		t.Fatal("interrupted purge was reported as complete")
	}
	CloseEditionInputs(s)
	if err := lib.Close(); err != nil {
		t.Fatal(err)
	}
	lib, err = editions.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer lib.Close()
	s = NewWithEditions(data, store, desk, lib, filepath.Join(root, "imports"))
	defer CloseEditionInputs(s)
	if len(lib.List()) != 0 {
		t.Fatal("restart did not finish removing the edition")
	}
	marks, err := store.Highlights("JHN", 3)
	if err != nil || len(marks) != 0 {
		t.Fatal("restart did not finish deleting annotations", err)
	}
	if pending, err := lib.PendingRemovals(); err != nil || len(pending) != 0 {
		t.Fatal("completed removal intent was retained", err)
	}
}

func TestCancelImportAndExpiredDraftDoNotInstall(t *testing.T) {
	data, _ := bible.Load()
	lib, e := editions.Open(filepath.Join(t.TempDir(), "editions.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer lib.Close()
	s := NewWithEditions(data, nil, &editionDesktop{}, lib, filepath.Join(t.TempDir(), "imports"))
	defer CloseEditionInputs(s)
	if r := s.ChooseEditionImport(); !r.OK || !r.Data.Cancelled {
		t.Fatal("cancelled file dialog failed")
	}
	if r := s.CommitEditionImport("no-draft", editions.Commit{}); r.OK || r.Error.Code != "DRAFT_EXPIRED" {
		t.Fatal("unknown draft accepted")
	}
	if len(lib.List()) != 0 {
		t.Fatal("cancel installed text")
	}
}
