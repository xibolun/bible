package editions

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/importer"
)

func draftFixture(t *testing.T, body string) *importer.Draft {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fixture.xml")
	source := `<XMLBIBLE biblename="Synthetic"><INFORMATION><rights>CC0 test fixture</rights></INFORMATION><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="3" e="4">` + body + `</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
	if e := os.WriteFile(path, []byte(source), 0600); e != nil {
		t.Fatal(e)
	}
	canon, e := bible.Load()
	if e != nil {
		t.Fatal(e)
	}
	d, e := importer.Parse(context.Background(), path, "fixture.xml", canon)
	if e != nil {
		t.Fatal(e)
	}
	return d
}
func TestLibraryDurabilityDuplicateVersionRecoveryAndRemoval(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "editions.sqlite")
	l, e := Open(filename)
	if e != nil {
		t.Fatal(e)
	}
	d := draftFixture(t, "晨光，é。[补词]")
	options := Commit{Name: "Synthetic", Abbreviation: "SYN", Language: "zh"}
	installed, e := l.Install(d, options)
	if e != nil {
		t.Fatal(e)
	}
	old := l.Snapshot()
	if dupe, e := l.Install(d, options); e != nil || !dupe.Duplicate || dupe.ID != installed.ID {
		t.Fatal("not idempotent", dupe, e)
	}
	changed := draftFixture(t, "新版正文。")
	options.ReplaceID = installed.ID
	if _, e = l.Install(changed, options); e != nil {
		t.Fatal(e)
	}
	verses, _ := old.Chapter(installed.ID, "JHN", 3)
	if verses[0].Text != d.Records[0].Text {
		t.Fatal("in-flight snapshot changed")
	}
	current, _ := l.Chapter(installed.ID, "JHN", 3)
	if current[0].Text != "新版正文。" || len(l.List()[0].Versions) != 2 {
		t.Fatal("replacement lost a version")
	}
	if e = l.Restore(installed.ID, d.Fingerprint); e != nil {
		t.Fatal(e)
	}
	l.Close()
	l, e = Open(filename)
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	current, _ = l.Chapter(installed.ID, "JHN", 3)
	if current[0].Text != d.Records[0].Text {
		t.Fatal("restart lost restored text")
	}
	if e = l.SetEnabled(installed.ID, false); e != nil {
		t.Fatal(e)
	}
	if len(l.Translations()) != 0 || len(l.List()) != 1 {
		t.Fatal("disabled catalogue incorrect")
	}
	if e = l.SetEnabled(installed.ID, true); e != nil {
		t.Fatal(e)
	}
	if e = l.BeginRemoval(installed.ID, true); e != nil {
		t.Fatal(e)
	}
	if !l.List()[0].Removing || len(l.Translations()) != 0 {
		t.Fatal("pending deletion must be unavailable")
	}
	options.ReplaceID = installed.ID
	if _, e = l.Install(draftFixture(t, "replacement during removal"), options); e == nil {
		t.Fatal("replacement revived an edition awaiting deletion")
	}
	pending, _ := l.PendingRemovals()
	if len(pending) != 1 || !pending[0].Purge {
		t.Fatal("lost durable deletion intent")
	}
	if e = l.Remove(installed.ID); e != nil {
		t.Fatal(e)
	}
	if len(l.List()) != 0 {
		t.Fatal("not removed")
	}
	var count int
	if e = l.db.QueryRow("SELECT count(*) FROM verses").Scan(&count); e != nil || count != 0 {
		t.Fatal("removed scripture payload retained")
	}
	options.ReplaceID = ""
	reinstalled, e := l.Install(d, options)
	if e != nil || reinstalled.ID != installed.ID {
		t.Fatal("same text did not recover tombstone identity", e)
	}
}
func TestExplicitUpdateKeepsIdentityEnabledStateAndVersionMetadata(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "library.sqlite")
	l, err := Open(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { l.Close() }()
	first := draftFixture(t, "First synthetic version.")
	first.SourceEdition = "1"
	options := Commit{Name: "My edition", Abbreviation: "MINE", Language: "en"}
	installed, err := l.Install(first, options)
	if err != nil {
		t.Fatal(err)
	}
	if err = l.SetEnabled(installed.ID, false); err != nil {
		t.Fatal(err)
	}
	second := draftFixture(t, "Second synthetic version.")
	second.SourceEdition = "2"
	options.ReplaceID = installed.ID
	for _, phase := range []string{"new text", "retained text", "same text new version"} {
		if phase == "retained text" {
			if err = l.Restore(installed.ID, first.Fingerprint); err != nil {
				t.Fatal(err)
			}
		}
		if phase == "same text new version" {
			second.SourceEdition = "2.1"
		}
		updated, err := l.Install(second, options)
		if err != nil || updated.ID != installed.ID {
			t.Fatalf("%s changed identity: %+v %v", phase, updated, err)
		}
		rows := l.List()
		if len(rows) != 1 || rows[0].Enabled || rows[0].Translation.Name != "My edition" || rows[0].Translation.DataVersion != second.Fingerprint || rows[0].Report.SourceEdition != second.SourceEdition || len(rows[0].Versions) != 2 {
			t.Fatalf("%s lost update metadata: %+v", phase, rows)
		}
	}
	invalid := options
	invalid.ReplaceID = "user:missing"
	if _, err = l.Install(second, invalid); err == nil {
		t.Fatal("duplicate text bypassed update target validation")
	}
	l.Close()
	l, err = Open(filename)
	if err != nil {
		t.Fatal(err)
	}
	if got := l.List()[0]; got.Enabled || got.Report.SourceEdition != "2.1" || got.Translation.ID != installed.ID {
		t.Fatalf("restart lost update: %+v", got)
	}
}

func TestFailedWriteRollsBackAndFutureSchemaIsRetained(t *testing.T) {
	l, e := Open(filepath.Join(t.TempDir(), "library.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	good := draftFixture(t, "original")
	options := Commit{Name: "Synthetic", Abbreviation: "SYN", Language: "en"}
	installed, e := l.Install(good, options)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = l.db.Exec(`CREATE TRIGGER test_failure BEFORE INSERT ON verses WHEN NEW.text='fail' BEGIN SELECT RAISE(FAIL,'simulated write failure'); END`); e != nil {
		t.Fatal(e)
	}
	options.ReplaceID = installed.ID
	if _, e = l.Install(draftFixture(t, "fail"), options); e == nil {
		t.Fatal("write fault ignored")
	}
	got, _ := l.Chapter(installed.ID, "JHN", 3)
	if got[0].Text != "original" || len(l.List()[0].Versions) != 1 {
		t.Fatal("partial replacement visible")
	}
	filename := filepath.Join(t.TempDir(), "future.sqlite")
	db, _ := sql.Open("sqlite", filename)
	_, _ = db.Exec("CREATE TABLE preserve_me(value TEXT);INSERT INTO preserve_me VALUES('untouched');PRAGMA user_version=99")
	db.Close()
	if future, e := Open(filename); e == nil {
		future.Close()
		t.Fatal("future schema accepted")
	}
	db, _ = sql.Open("sqlite", filename)
	defer db.Close()
	var value string
	if e = db.QueryRow("SELECT value FROM preserve_me").Scan(&value); e != nil || value != "untouched" {
		t.Fatal("future data changed")
	}
}
func TestConcurrentReadersKeepOneImmutableVersion(t *testing.T) {
	l, e := Open(filepath.Join(t.TempDir(), "library.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	d := draftFixture(t, "old")
	options := Commit{Name: "S", Abbreviation: "S", Language: "en"}
	id, e := l.Install(d, options)
	if e != nil {
		t.Fatal(e)
	}
	next := draftFixture(t, "new")
	var wg sync.WaitGroup
	for n := 0; n < 8; n++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reader := l.Snapshot()
			a, e := reader.Chapter(id.ID, "JHN", 3)
			if e != nil || len(a) != 1 {
				t.Error("failed reader", e)
				return
			}
			for i := 0; i < 10; i++ {
				b, e := reader.Chapter(id.ID, "JHN", 3)
				if e != nil || b[0].Text != a[0].Text {
					t.Error("mixed reader versions")
				}
			}
		}()
	}
	options.ReplaceID = id.ID
	if _, e = l.Install(next, options); e != nil {
		t.Fatal(e)
	}
	wg.Wait()
}

func TestReadFailuresHaveStablePrivateEditionError(t *testing.T) {
	l, e := Open(filepath.Join(t.TempDir(), "private-library.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	id, e := l.Install(draftFixture(t, "body"), Commit{Name: "T", Abbreviation: "T", Language: "en"})
	if e != nil {
		t.Fatal(e)
	}
	reader := l.Snapshot()
	l.Close()
	if _, e = reader.Chapter(id.ID, "JHN", 3); e == nil || e.Error() != "EDITION_DATA_UNAVAILABLE" {
		t.Fatal("chapter error", e)
	}
	if _, e = reader.Coverage(id.ID); e == nil || e.Error() != "EDITION_DATA_UNAVAILABLE" {
		t.Fatal("coverage error", e)
	}
	if e = reader.Walk(id.ID, func(string, int, bible.Verse) {}); e == nil || e.Error() != "EDITION_DATA_UNAVAILABLE" {
		t.Fatal("search error", e)
	}
}
