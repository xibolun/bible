package importer

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestSQLiteSourceURIReadsEscapedNativePathWithoutWriting(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "edition #100%+ 中文.sqlite3")
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("CREATE TABLE sample(text TEXT); INSERT INTO sample VALUES('unchanged sample')"); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	uri, err := sqliteSourceURI(filename)
	if err != nil {
		t.Fatal(err)
	}
	readonly, err := sql.Open("sqlite", uri)
	if err != nil {
		t.Fatal(err)
	}
	defer readonly.Close()
	var text string
	if err = readonly.QueryRow("SELECT text FROM sample").Scan(&text); err != nil || text != "unchanged sample" {
		t.Fatalf("cannot read native escaped path: %q, %v", text, err)
	}
	if _, err = readonly.Exec("UPDATE sample SET text='changed'"); err == nil {
		t.Fatal("source database must remain read-only")
	}
	after, err := os.ReadFile(filename)
	if err != nil || string(before) != string(after) {
		t.Fatalf("source bytes changed: %v", err)
	}
}
