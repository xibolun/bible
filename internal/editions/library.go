// Package editions owns private, versioned user texts, separate from settings.
package editions

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/importer"
	_ "modernc.org/sqlite"
)

type Version struct {
	Fingerprint   string `json:"fingerprint"`
	SourceEdition string `json:"sourceEdition"`
	Created       string `json:"created"`
}
type Install struct {
	Translation bible.Translation `json:"translation"`
	Enabled     bool              `json:"enabled"`
	Report      importer.Draft    `json:"report"`
	Versions    []Version         `json:"versions"`
	Bytes       int64             `json:"bytes"`
	Removing    bool              `json:"removing"`
}
type Commit struct {
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
	Language     string `json:"language"`
	ReplaceID    string `json:"replaceId"`
}
type Installed struct {
	ID        string `json:"id"`
	Duplicate bool   `json:"duplicate"`
}
type Library struct {
	db      *sql.DB
	mu      sync.RWMutex
	write   sync.Mutex
	catalog []Install
}

func Open(filename string) (*Library, error) {
	if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	bad := func(e error) (*Library, error) { db.Close(); return nil, e }
	var version int
	if err = db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return bad(err)
	}
	if version > 1 {
		return bad(fmt.Errorf("EDITION_SCHEMA_FUTURE"))
	}
	if _, err = db.Exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;"); err != nil {
		return bad(err)
	}
	if version == 0 {
		var n int
		if err = db.QueryRow("SELECT count(*) FROM sqlite_schema WHERE type='table'").Scan(&n); err != nil {
			return bad(err)
		}
		if n > 0 {
			return bad(fmt.Errorf("EDITION_SCHEMA_UNSUPPORTED"))
		}
		_, err = db.Exec(`BEGIN;
  CREATE TABLE editions(id TEXT PRIMARY KEY, active_version TEXT NOT NULL, enabled INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE versions(id TEXT NOT NULL, version TEXT NOT NULL, manifest TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(id,version));
  CREATE TABLE verses(id TEXT NOT NULL, version TEXT NOT NULL, book TEXT NOT NULL, chapter INTEGER NOT NULL, ordinal INTEGER NOT NULL, label TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(id,version,book,chapter,label));
  CREATE INDEX verse_order ON verses(id,version,ordinal);
  CREATE TABLE import_jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, summary TEXT NOT NULL);
  CREATE TABLE removals(id TEXT PRIMARY KEY, purge INTEGER NOT NULL);
  PRAGMA user_version=1; COMMIT;`)
		if err != nil {
			return bad(err)
		}
	}
	_, err = db.Exec("UPDATE import_jobs SET status='interrupted' WHERE status IN ('queued','inspecting','ready','committing')")
	if err != nil {
		return bad(err)
	}
	_ = os.Chmod(filename, 0600)
	l := &Library{db: db}
	if err = l.refresh(); err != nil {
		return bad(err)
	}
	return l, nil
}
func (l *Library) Close() error { return l.db.Close() }
func translation(id string, d importer.Draft) bible.Translation {
	return bible.Translation{ID: id, Name: d.Name, Abbreviation: d.Abbreviation, Language: d.Language, DataVersion: d.Fingerprint, License: d.License, SourceURL: d.SourceURL, Origin: "user", SourceFormat: d.Format, SourceEdition: d.SourceEdition, Versification: d.Versification, Comparable: d.Versification == "KJV"}
}
func (l *Library) refresh() error {
	rows, err := l.db.Query("SELECT e.id,e.enabled,v.manifest,EXISTS(SELECT 1 FROM removals r WHERE r.id=e.id) FROM editions e JOIN versions v ON v.id=e.id AND v.version=e.active_version WHERE e.deleted=0 ORDER BY e.rowid")
	if err != nil {
		return err
	}
	list := []Install{}
	for rows.Next() {
		var id, manifest string
		var enabled bool
		var removing bool
		if err = rows.Scan(&id, &enabled, &manifest, &removing); err != nil {
			rows.Close()
			return err
		}
		var d importer.Draft
		if err = json.Unmarshal([]byte(manifest), &d); err != nil {
			rows.Close()
			return err
		}
		list = append(list, Install{Translation: translation(id, d), Enabled: enabled, Report: d, Versions: []Version{}, Removing: removing})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for i := range list {
		versions, e := l.db.Query("SELECT version,manifest,created FROM versions WHERE id=? ORDER BY created DESC", list[i].Translation.ID)
		if e != nil {
			return e
		}
		for versions.Next() {
			var v Version
			var meta string
			if e = versions.Scan(&v.Fingerprint, &meta, &v.Created); e != nil {
				versions.Close()
				return e
			}
			var d importer.Draft
			if e = json.Unmarshal([]byte(meta), &d); e != nil {
				versions.Close()
				return e
			}
			v.SourceEdition = d.SourceEdition
			list[i].Versions = append(list[i].Versions, v)
		}
		err = versions.Err()
		versions.Close()
		if err != nil {
			return err
		}
		if err = l.db.QueryRow("SELECT coalesce(sum(length(CAST(text AS BLOB))),0) FROM verses WHERE id=?", list[i].Translation.ID).Scan(&list[i].Bytes); err != nil {
			return err
		}
	}
	l.mu.Lock()
	l.catalog = list
	l.mu.Unlock()
	return nil
}
func (l *Library) List() []Install {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]Install, len(l.catalog))
	for i, v := range l.catalog {
		out[i] = v
		out[i].Versions = slices.Clone(v.Versions)
		out[i].Report.Diagnostics = slices.Clone(v.Report.Diagnostics)
		out[i].Report.Metadata = map[string]string{}
		for k, s := range v.Report.Metadata {
			out[i].Report.Metadata[k] = s
		}
	}
	return out
}
func (l *Library) Translations() []bible.Translation { return l.Snapshot().Translations() }
func (l *Library) Snapshot() bible.EditionProvider {
	m := map[string]Install{}
	for _, v := range l.List() {
		if v.Enabled && !v.Removing {
			m[v.Translation.ID] = v
		}
	}
	return &reader{library: l, installs: m}
}
func (l *Library) Chapter(id, book string, ch int) ([]bible.Verse, error) {
	return l.Snapshot().Chapter(id, book, ch)
}
func (l *Library) Coverage(id string) (map[string][]int, error) { return l.Snapshot().Coverage(id) }
func (l *Library) Walk(id string, fn func(string, int, bible.Verse)) error {
	return l.Snapshot().Walk(id, fn)
}

type reader struct {
	library  *Library
	installs map[string]Install
	mu       sync.Mutex
	chapters map[string][]bible.Verse
}

func (r *reader) Snapshot() bible.EditionProvider { return r }
func (r *reader) Translations() []bible.Translation {
	out := []bible.Translation{}
	for _, v := range r.installs {
		out = append(out, v.Translation)
	}
	slices.SortFunc(out, func(a, b bible.Translation) int { return strings.Compare(a.ID, b.ID) })
	return out
}
func (r *reader) version(id string) (string, error) {
	v, ok := r.installs[id]
	if !ok {
		return "", fmt.Errorf("INVALID_TRANSLATION")
	}
	return v.Translation.DataVersion, nil
}
func (r *reader) Chapter(id, book string, ch int) ([]bible.Verse, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := fmt.Sprintf("%s/%s/%d", id, book, ch)
	if cached, ok := r.chapters[key]; ok {
		return cached, nil
	}
	version, err := r.version(id)
	if err != nil {
		return nil, err
	}
	rows, err := r.library.db.Query("SELECT label,text FROM verses WHERE id=? AND version=? AND book=? AND chapter=? AND text<>'' ORDER BY ordinal", id, version, book, ch)
	if err != nil {
		return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	defer rows.Close()
	out := []bible.Verse{}
	for rows.Next() {
		var v bible.Verse
		if rows.Scan(&v.Label, &v.Text) != nil {
			return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
		}
		out = append(out, v)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	if r.chapters == nil {
		r.chapters = map[string][]bible.Verse{}
	}
	r.chapters[key] = out
	return out, nil
}
func (r *reader) Coverage(id string) (map[string][]int, error) {
	version, err := r.version(id)
	if err != nil {
		return nil, err
	}
	rows, err := r.library.db.Query("SELECT DISTINCT book,chapter FROM verses WHERE id=? AND version=? AND text<>'' ORDER BY chapter", id, version)
	if err != nil {
		return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	defer rows.Close()
	out := map[string][]int{}
	for rows.Next() {
		var book string
		var ch int
		if err = rows.Scan(&book, &ch); err != nil {
			return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
		}
		out[book] = append(out[book], ch)
	}
	if rows.Err() != nil {
		return nil, fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	return out, nil
}
func (r *reader) Walk(id string, fn func(string, int, bible.Verse)) error {
	version, err := r.version(id)
	if err != nil {
		return err
	}
	rows, err := r.library.db.Query("SELECT book,chapter,label,text FROM verses WHERE id=? AND version=? AND text<>'' ORDER BY ordinal", id, version)
	if err != nil {
		return fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	defer rows.Close()
	for rows.Next() {
		var book string
		var ch int
		var v bible.Verse
		if err = rows.Scan(&book, &ch, &v.Label, &v.Text); err != nil {
			return fmt.Errorf("EDITION_DATA_UNAVAILABLE")
		}
		fn(book, ch, v)
	}
	if rows.Err() != nil {
		return fmt.Errorf("EDITION_DATA_UNAVAILABLE")
	}
	return nil
}

func (l *Library) Install(d *importer.Draft, options Commit) (Installed, error) {
	l.write.Lock()
	defer l.write.Unlock()
	for _, v := range []string{options.Name, options.Abbreviation, options.Language} {
		if !utf8.ValidString(v) || strings.ContainsRune(v, 0) {
			return Installed{}, fmt.Errorf("INVALID_SETTINGS")
		}
	}
	if strings.TrimSpace(options.Name) == "" || len([]rune(options.Name)) > 100 || strings.TrimSpace(options.Abbreviation) == "" || len([]rune(options.Abbreviation)) > 32 || len(options.Language) > 35 {
		return Installed{}, fmt.Errorf("INVALID_SETTINGS")
	}
	tx, err := l.db.Begin()
	if err != nil {
		return Installed{}, err
	}
	defer tx.Rollback()
	var existing string
	var deleted bool
	e := tx.QueryRow("SELECT v.id,e.deleted FROM versions v JOIN editions e ON e.id=v.id WHERE v.version=? ORDER BY e.deleted LIMIT 1", d.Fingerprint).Scan(&existing, &deleted)
	if e == nil && !deleted {
		return Installed{existing, true}, nil
	}
	if e != nil && e != sql.ErrNoRows {
		return Installed{}, e
	}
	id := existing
	if options.ReplaceID != "" {
		var n int
		if err = tx.QueryRow("SELECT count(*) FROM editions WHERE id=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM removals WHERE removals.id=editions.id)", options.ReplaceID).Scan(&n); err != nil || n != 1 {
			return Installed{}, fmt.Errorf("INVALID_TRANSLATION")
		}
		id = options.ReplaceID
	}
	if id == "" {
		id = "user:" + uuid.NewString()
	}
	meta := *d
	meta.Name = strings.TrimSpace(options.Name)
	meta.Abbreviation = strings.TrimSpace(options.Abbreviation)
	meta.Language = strings.TrimSpace(options.Language)
	meta.Records = nil
	manifest, err := json.Marshal(meta)
	if err != nil {
		return Installed{}, err
	}
	_, err = tx.Exec("INSERT INTO editions(id,active_version,enabled,deleted) VALUES(?,?,1,0) ON CONFLICT(id) DO UPDATE SET active_version=excluded.active_version,enabled=1,deleted=0", id, d.Fingerprint)
	if err != nil {
		return Installed{}, err
	}
	_, err = tx.Exec("INSERT INTO versions(id,version,manifest,created) VALUES(?,?,?,?) ON CONFLICT(id,version) DO UPDATE SET manifest=excluded.manifest", id, d.Fingerprint, string(manifest), time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return Installed{}, err
	}
	if _, err = tx.Exec("DELETE FROM verses WHERE id=? AND version=?", id, d.Fingerprint); err != nil {
		return Installed{}, err
	}
	stmt, err := tx.Prepare("INSERT INTO verses(id,version,book,chapter,ordinal,label,text) VALUES(?,?,?,?,?,?,?)")
	if err != nil {
		return Installed{}, err
	}
	defer stmt.Close()
	for n, v := range d.Records {
		if _, err = stmt.Exec(id, d.Fingerprint, v.Book, v.Chapter, n, v.Label, v.Text); err != nil {
			return Installed{}, err
		}
	}
	if err = tx.Commit(); err != nil {
		return Installed{}, err
	}
	if err = l.refresh(); err != nil {
		return Installed{}, err
	}
	return Installed{id, false}, nil
}
func (l *Library) SetEnabled(id string, enabled bool) error {
	l.write.Lock()
	defer l.write.Unlock()
	result, err := l.db.Exec("UPDATE editions SET enabled=? WHERE id=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM removals WHERE removals.id=editions.id)", enabled, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return fmt.Errorf("INVALID_TRANSLATION")
	}
	return l.refresh()
}
func (l *Library) Restore(id, version string) error {
	l.write.Lock()
	defer l.write.Unlock()
	var n int
	if err := l.db.QueryRow("SELECT count(*) FROM verses WHERE id=? AND version=?", id, version).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("DATA_UNAVAILABLE")
	}
	result, err := l.db.Exec("UPDATE editions SET active_version=? WHERE id=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM removals WHERE removals.id=editions.id)", version, id)
	if err != nil {
		return err
	}
	n64, _ := result.RowsAffected()
	if n64 != 1 {
		return fmt.Errorf("INVALID_TRANSLATION")
	}
	return l.refresh()
}
func (l *Library) Remove(id string) error {
	l.write.Lock()
	defer l.write.Unlock()
	tx, err := l.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec("UPDATE editions SET deleted=1,enabled=0 WHERE id=? AND deleted=0", id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return fmt.Errorf("INVALID_TRANSLATION")
	}
	if _, err = tx.Exec("DELETE FROM verses WHERE id=?", id); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM removals WHERE id=?", id); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return l.refresh()
}
func (l *Library) SaveJob(id, status string, summary any) error {
	b, err := json.Marshal(summary)
	if err != nil {
		return err
	}
	_, err = l.db.Exec("INSERT INTO import_jobs(id,status,summary) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,summary=excluded.summary", id, status, string(b))
	return err
}

type Removal struct {
	ID    string
	Purge bool
}

func (l *Library) BeginRemoval(id string, purge bool) error {
	l.write.Lock()
	defer l.write.Unlock()
	tx, err := l.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec("UPDATE editions SET enabled=0 WHERE id=? AND deleted=0", id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return fmt.Errorf("INVALID_TRANSLATION")
	}
	if _, err = tx.Exec("INSERT INTO removals(id,purge) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET purge=max(removals.purge,excluded.purge)", id, purge); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return l.refresh()
}
func (l *Library) PendingRemovals() ([]Removal, error) {
	rows, err := l.db.Query("SELECT id,purge FROM removals")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Removal{}
	for rows.Next() {
		var r Removal
		if err = rows.Scan(&r.ID, &r.Purge); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
