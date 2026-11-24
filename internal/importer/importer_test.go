package importer

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"unicode/utf16"

	"github.com/xibolun/bible/internal/bible"
)

// All words here are synthetic, authored for these tests, not a Bible edition.
var testCanon = sync.OnceValues(bible.Load)

func canonForTest(t *testing.T) *bible.Dataset {
	t.Helper()
	d, e := testCanon()
	if e != nil {
		t.Fatal(e)
	}
	return d
}
func fileForTest(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if e := os.WriteFile(p, []byte(content), 0600); e != nil {
		t.Fatal(e)
	}
	return p
}
func parseForTest(t *testing.T, name, content string) *Draft {
	t.Helper()
	p := fileForTest(t, name, content)
	d, e := Parse(context.Background(), p, name, canonForTest(t))
	if e != nil {
		t.Fatal(e)
	}
	return d
}
func TestXMLProfilesPreserveExactTextAndReferences(t *testing.T) {
	z := `<?xml version="1.0"?><XMLBIBLE biblename="Synthetic" version="2.0.1.22"><INFORMATION><identifier>SYN</identifier><language>zh</language><rights>Test fixture, CC0</rights></INFORMATION><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="1">[晨光]é<STYLE css="font-style:italic">照耀</STYLE><NOTE>not scripture</NOTE><BR/>第二行。</VERS><VERS vnumber="3" e="4">合并，保留。</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
	d := parseForTest(t, "test.xml", z)
	if d.Format != "zefania" || d.Books != 1 || d.Chapters != 1 || d.Verses != 2 || d.Records[0] != (Record{"JHN", 3, "1", "[晨光]é照耀\n第二行。"}) || d.Records[1].Label != "3-4" || d.License != "Test fixture, CC0" {
		t.Fatalf("wrong conversion: %#v", d)
	}
	for _, body := range []string{`<verse osisID="John.3.1">[晨光]é<hi type="italic">照耀</hi><note>not scripture</note><lb/>第二行。</verse><verse osisID="John.3.3 John.3.4">合并，保留。</verse>`, `<verse osisID="John.3.1" sID="v1"/>[晨光]é<hi>照耀</hi><note>not scripture</note><lb/>第二行。<verse eID="v1"/><verse osisID="John.3.3 John.3.4" sID="v2"/>合并，保留。<verse eID="v2"/>`} {
		other := parseForTest(t, "test.osis", `<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace"><osisText><header><work><title>Synthetic</title><rights>Test fixture, CC0</rights></work></header><div type="book" osisID="John"><chapter osisID="John.3">`+body+`</chapter></div></osisText></osis>`)
		if other.Format != "osis" || other.Fingerprint != d.Fingerprint {
			t.Fatalf("equivalent formats differ: %#v", other)
		}
	}
	// Explicit UTF-16 BOM and declaration, including supplementary characters.
	s := strings.Replace(z, `<?xml version="1.0"?>`, `<?xml version="1.0" encoding="utf-16"?>`, 1)
	s = strings.Replace(s, "[晨光]", "[晨光😀]", 1)
	var b bytes.Buffer
	b.Write([]byte{0xff, 0xfe})
	for _, u := range utf16.Encode([]rune(s)) {
		_ = binary.Write(&b, binary.LittleEndian, u)
	}
	utf := parseForTest(t, "utf16.xml", b.String())
	if !strings.Contains(utf.Records[0].Text, "😀") {
		t.Fatal("lost supplementary character")
	}
}
func TestSQLiteProfilesHaveDistinctBookMappings(t *testing.T) {
	for _, kind := range []string{"mybible", "mysword"} {
		t.Run(kind, func(t *testing.T) {
			p := filepath.Join(t.TempDir(), "not-trusted.sqlite3")
			db, e := sql.Open("sqlite", p)
			if e != nil {
				t.Fatal(e)
			}
			var ddl string
			if kind == "mybible" {
				ddl = `CREATE TABLE info(name TEXT,value TEXT); INSERT INTO info VALUES('description','Synthetic'),('language','zh'),('detailed_info','CC0 fixture'); CREATE TABLE books(book_number INTEGER);INSERT INTO books VALUES(500);CREATE TABLE verses(book_number INTEGER,chapter INTEGER,verse INTEGER,text TEXT);INSERT INTO verses VALUES(500,3,1,'[晨光]<i>照耀</i><S>1</S><n>not scripture</n><br/>第二行。'),(500,3,3,'合并，保留。');`
			} else {
				ddl = `CREATE TABLE Details(Description TEXT,Abbreviation TEXT,Comments TEXT);INSERT INTO Details VALUES('Synthetic','SYN','CC0 fixture'); CREATE TABLE Bible(Book INTEGER,Chapter INTEGER,Verse INTEGER,Scripture TEXT);INSERT INTO Bible VALUES(43,3,1,'[晨光]<FI>照耀<Fi><WG1><RF>not scripture<Rf><CL>第二行。'),(43,3,3,'合并，保留。');`
			}
			if _, e = db.Exec(ddl); e != nil {
				t.Fatal(e)
			}
			db.Close()
			d, e := Parse(context.Background(), p, "misleading.xml", canonForTest(t))
			if e != nil {
				t.Fatal(e)
			}
			if d.Format != kind || d.Records[0] != (Record{"JHN", 3, "1", "[晨光]照耀\n第二行。"}) {
				t.Fatalf("wrong mapping/tags: %#v", d)
			}
		})
	}
}
func TestTheWordFixedIndexKeepsBlankLinesAndMetadata(t *testing.T) {
	lines := make([]string, 7957)
	lines[0] = "<FI>晨光<Fi><RF>excluded<Rf>照耀。"
	lines[7956] = "最后一行。"
	s := strings.Join(lines, "\r\n") + "\r\ntitle=Synthetic NT\r\nshort.title=SYN\r\nlang=zh\r\nabout=CC0 fixture\r\n"
	d := parseForTest(t, "fixture.nt", "\ufeff"+s)
	if d.Records[0].Book != "MAT" || d.Records[0].Label != "1" || d.Records[0].Text != "晨光照耀。" || d.Records[1].Text != "" || d.Records[7956].Book != "REV" || d.Records[7956].Chapter != 22 || d.Records[7956].Label != "21" || d.Name != "Synthetic NT" || d.Versification != "KJV" {
		t.Fatalf("incorrect fixed index %#v", d)
	}
	p := fileForTest(t, "bad.nt", strings.Replace(s, "\r\n", "", 1))
	if _, e := Parse(context.Background(), p, "bad.nt", canonForTest(t)); e == nil {
		t.Fatal("accepted shifted line count")
	}
	for _, rule := range []string{"verse.rule", "tag.rule", "notags"} {
		p := fileForTest(t, "rules.nt", s+rule+"=custom\n")
		if _, e := Parse(context.Background(), p, "rules.nt", canonForTest(t)); e == nil {
			t.Fatal("custom renderer accepted without conversion", rule)
		}
	}
}

func TestTheWordWholeBibleAndTestamentProfiles(t *testing.T) {
	for _, tc := range []struct {
		ext, first, last       string
		count, books, chapters int
	}{
		{"ont", "GEN", "REV", 31102, 66, 1189},
		{"ot", "GEN", "MAL", 23145, 39, 929},
		{"nt", "MAT", "REV", 7957, 27, 260},
	} {
		t.Run(tc.ext, func(t *testing.T) {
			d := parseForTest(t, "complete."+tc.ext, strings.Repeat("Self-authored synthetic text.\n", tc.count)+"title=Synthetic profile fixture\nabout=CC0\n")
			if len(d.Records) != tc.count || d.Books != tc.books || d.Chapters != tc.chapters || d.Records[0].Book != tc.first || d.Records[tc.count-1].Book != tc.last {
				t.Fatalf("incorrect %s coverage: %d/%d/%d", tc.ext, d.Books, d.Chapters, len(d.Records))
			}
		})
	}
}

func TestSourceSplitLabelsAndBlankJoinedPlaceholdersRemainDistinct(t *testing.T) {
	d := &Draft{Versification: "unknown", Records: []Record{
		{"JHN", 3, "1a", "First fragment."},
		{"JHN", 3, "1b", "Second fragment."},
		{"JHN", 3, "3-5", "Complete joined text."},
		{"JHN", 3, "4", ""},
		{"JHN", 3, "6", "After the join."},
	}}
	if err := validate(context.Background(), d, canonForTest(t)); err != nil {
		t.Fatal(err)
	}
	if d.Records[0].Label != "1a" || d.Records[1].Label != "1b" || d.Records[2].Label != "3-5" || d.Records[3].Text != "" {
		t.Fatal("source labels or placeholders were rewritten")
	}
	d.Records[3].Text = "Ambiguous overlapping text."
	if err := validate(context.Background(), d, canonForTest(t)); err == nil {
		t.Fatal("actual overlapping scripture accepted")
	}
}

func TestFileLimitIsCheckedBeforeReadingSource(t *testing.T) {
	p := fileForTest(t, "oversized.xml", "")
	if err := os.Truncate(p, MaxFile+1); err != nil {
		t.Fatal(err)
	}
	_, err := Parse(context.Background(), p, "oversized.xml", canonForTest(t))
	if code, _ := Describe(err); code != "IMPORT_LIMIT" {
		t.Fatal("oversized file did not report its resource limit", err)
	}
}
func TestRejectsUnknownOrAmbiguousScriptureWithoutLoss(t *testing.T) {
	cases := []string{
		`<XMLBIBLE><BIBLEBOOK bnumber="67"><CHAPTER cnumber="1"><VERS vnumber="1">x</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`,
		`<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1"><unknown>lost</unknown></VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`,
		`<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">a</VERS><VERS vnumber="1">b</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`,
		`<!DOCTYPE XMLBIBLE [<!ENTITY x SYSTEM "file:///etc/passwd">]><XMLBIBLE>&x;</XMLBIBLE>`,
		`<osis><osisText><verse osisID="Gen.1.1" sID="a"/>word<verse eID="b"/></osisText></osis>`,
		`<osis><osisText><verse osisID="Gen.1.1 Gen.1.3">word</verse></osisText></osis>`,
		`<osis><osisText><verse osisID="Gen.1.1">` + strings.Repeat("x", 65<<10) + `</verse></osisText></osis>`,
	}
	for i, s := range cases {
		p := fileForTest(t, "bad.xml", s)
		if _, e := Parse(context.Background(), p, "bad.xml", canonForTest(t)); e == nil {
			t.Fatalf("case %d accepted", i)
		}
	}
	for _, raw := range []string{"x<widget>lost</widget>", "x<RF>unclosed", "x<rtf tag=\"\\b\">body</rtf>"} {
		if _, e := plainTags(raw, "gbf"); e == nil {
			t.Fatalf("accepted unknown tag: %s", raw)
		}
	}
}
func TestArchivesAndCancellation(t *testing.T) {
	for _, name := range []string{"../escaped.xml", "/absolute.xml", "a.zip"} {
		var b bytes.Buffer
		z := zip.NewWriter(&b)
		f, _ := z.Create(name)
		_, _ = f.Write([]byte("bad"))
		z.Close()
		p := fileForTest(t, "bad.zip", b.String())
		if _, e := Parse(context.Background(), p, "bad.zip", canonForTest(t)); e == nil {
			t.Fatal("accepted unsafe archive")
		}
	}
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	f, _ := z.Create("nested/test.xml")
	_, _ = f.Write([]byte(`<XMLBIBLE biblename="Fixture"><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">Synthetic</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`))
	z.Close()
	d := parseForTest(t, "test.zip", b.String())
	if d.Format != "zefania" || len(d.SourceHash) != 64 {
		t.Fatal("ZIP did not use same validation")
	}
	p := fileForTest(t, "cancel.xml", `<osis/>`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := Parse(ctx, p, "cancel.xml", canonForTest(t)); e == nil {
		t.Fatal("cancelled parse succeeded")
	}
}
func TestRejectsDatabaseViewsAndForeignSchemas(t *testing.T) {
	for _, ddl := range []string{`CREATE TABLE settings(value TEXT)`, `CREATE TABLE info(name TEXT,value TEXT);CREATE TABLE books(book_number INTEGER);CREATE VIEW verses AS SELECT 10 AS book_number,1 AS chapter,1 AS verse,'hidden' AS text`, `CREATE TABLE info(name TEXT,value TEXT);CREATE TABLE books(book_number INTEGER);CREATE TABLE verses(book_number INTEGER,chapter INTEGER,verse INTEGER,source TEXT,text TEXT GENERATED ALWAYS AS(source) VIRTUAL);INSERT INTO books VALUES(10);INSERT INTO verses(book_number,chapter,verse,source) VALUES(10,1,1,'computed text')`} {
		p := filepath.Join(t.TempDir(), "test.db")
		db, _ := sql.Open("sqlite", p)
		if _, e := db.Exec(ddl); e != nil {
			t.Fatal(e)
		}
		db.Close()
		if _, e := Parse(context.Background(), p, "test.SQLite3", canonForTest(t)); e == nil {
			t.Fatal("accepted executable or foreign schema")
		}
	}
}
