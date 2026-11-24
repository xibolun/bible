package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/xibolun/bible/internal/annotations"
	_ "modernc.org/sqlite"
)

type Highlight struct {
	TranslationID string `json:"translationId"`
	DataVersion   string `json:"dataVersion"`
	BookID        string `json:"bookId"`
	Chapter       int    `json:"chapter"`
	VerseKey      string `json:"verseKey"`
	Start         int    `json:"start"`
	End           int    `json:"end"`
	Color         string `json:"color"`
}

type Store struct {
	db *sql.DB
	mu sync.Mutex
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	fail := func(e error) (*Store, error) { db.Close(); return nil, e }
	if _, err = db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		return fail(err)
	}
	var version int
	if err = db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return fail(err)
	}
	if version > 1 {
		return fail(fmt.Errorf("unsupported user database schema; original retained"))
	}
	if version == 0 {
		var tables int
		if err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table'").Scan(&tables); err != nil {
			return fail(err)
		}
		if tables > 0 {
			backup := path + ".before-v1-" + time.Now().UTC().Format("20060102T150405.000000000")
			b, e := os.ReadFile(path)
			if e != nil {
				return fail(e)
			}
			if e = os.WriteFile(backup, b, 0600); e != nil {
				return fail(e)
			}
		}
		tx, e := db.Begin()
		if e != nil {
			return fail(e)
		}
		_, e = tx.Exec(`CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS highlights (translation TEXT NOT NULL, version TEXT NOT NULL, book TEXT NOT NULL, chapter INTEGER NOT NULL, verse TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, color TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS chapter_highlights ON highlights(book,chapter);
		CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY);
		PRAGMA user_version=1;`)
		if e != nil {
			tx.Rollback()
			return fail(e)
		}
		if e = tx.Commit(); e != nil {
			return fail(e)
		}
	}
	_ = os.Chmod(path, 0600)
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Idempotent cleanup participates in the edition library's durable removal log.
func (s *Store) DeleteEditionHighlights(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM highlights WHERE translation=?", id)
	return err
}

func (s *Store) Preferences(dst any) error {
	var b string
	err := s.db.QueryRow("SELECT value FROM settings WHERE id=1").Scan(&b)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(b), dst)
}

func (s *Store) SavePreferences(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value", string(b))
	return err
}

func (s *Store) Highlights(book string, chapter int) ([]Highlight, error) {
	rows, err := s.db.Query("SELECT translation,version,book,chapter,verse,start,end,color FROM highlights WHERE book=? AND chapter=? ORDER BY translation,verse,start", book, chapter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Highlight{}
	for rows.Next() {
		var h Highlight
		if err := rows.Scan(&h.TranslationID, &h.DataVersion, &h.BookID, &h.Chapter, &h.VerseKey, &h.Start, &h.End, &h.Color); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (s *Store) Paint(request string, spans []Highlight, color string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var found int
	err = tx.QueryRow("SELECT count(*) FROM operations WHERE id=?", request).Scan(&found)
	if err != nil {
		return err
	}
	if found > 0 {
		return nil
	}
	for _, span := range spans {
		args := []any{span.TranslationID, span.DataVersion, span.BookID, span.Chapter, span.VerseKey}
		rows, e := tx.Query("SELECT start,end,color FROM highlights WHERE translation=? AND version=? AND book=? AND chapter=? AND verse=?", args...)
		if e != nil {
			return e
		}
		old := []annotations.Interval{}
		for rows.Next() {
			var p annotations.Interval
			if e = rows.Scan(&p.Start, &p.End, &p.Color); e != nil {
				rows.Close()
				return e
			}
			old = append(old, p)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		_, e = tx.Exec("DELETE FROM highlights WHERE translation=? AND version=? AND book=? AND chapter=? AND verse=?", args...)
		if e != nil {
			return e
		}
		for _, p := range annotations.Paint(old, span.Start, span.End, color) {
			_, e = tx.Exec("INSERT INTO highlights(translation,version,book,chapter,verse,start,end,color) VALUES(?,?,?,?,?,?,?,?)", append(args, p.Start, p.End, p.Color)...)
			if e != nil {
				return e
			}
		}
	}
	if _, err = tx.Exec("INSERT INTO operations(id) VALUES(?)", request); err != nil {
		return err
	}
	return tx.Commit()
}
