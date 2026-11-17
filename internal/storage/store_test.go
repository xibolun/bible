package storage

import (
	"path/filepath"
	"testing"
)

func TestTransactionsAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "user.db")
	s, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	h := Highlight{TranslationID: "cuv", DataVersion: "v1", BookID: "GEN", Chapter: 1, VerseKey: "1", Start: 0, End: 10}
	if e = s.Paint("first", []Highlight{h}, "yellow"); e != nil {
		t.Fatal(e)
	}
	if e = s.SavePreferences(map[string]any{"fontSize": 22}); e != nil {
		t.Fatal(e)
	}
	// A later verse failure must roll back earlier writes in the same selection.
	_, e = s.db.Exec(`CREATE TRIGGER fail_second BEFORE INSERT ON highlights WHEN NEW.verse='2' BEGIN SELECT RAISE(ABORT,'injected failure'); END`)
	if e != nil {
		t.Fatal(e)
	}
	h2 := h
	h2.VerseKey = "2"
	if e = s.Paint("fails", []Highlight{h, h2}, "green"); e == nil {
		t.Fatal("expected injected failure")
	}
	got, e := s.Highlights("GEN", 1)
	if e != nil || len(got) != 1 || got[0].Color != "yellow" {
		t.Fatalf("rollback failed: %+v %v", got, e)
	}
	if e = s.Paint("first", []Highlight{h}, "green"); e != nil {
		t.Fatal(e)
	}
	s.Close()
	s, e = Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	got, e = s.Highlights("GEN", 1)
	if e != nil || len(got) != 1 || got[0].Color != "yellow" {
		t.Fatal("restart/idempotence failure")
	}
	var p map[string]any
	if e = s.Preferences(&p); e != nil || p["fontSize"] != float64(22) {
		t.Fatal("preferences not persisted")
	}
	_, e = s.db.Exec("PRAGMA user_version=99")
	if e != nil {
		t.Fatal(e)
	}
	s.Close()
	if newer, e := Open(path); e == nil {
		newer.Close()
		t.Fatal("future schema must not be silently altered")
	}
}
