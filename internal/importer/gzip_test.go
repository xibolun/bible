package importer

import (
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func gzipFixture(t *testing.T, name string, source []byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	w := gzip.NewWriter(&buffer)
	w.Name = name
	if _, err := w.Write(source); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestMySwordASVWrappersAndAlreadyDecodedGZName(t *testing.T) {
	const expected = "Synthetic é [supplied] שָׁלוֹם\nSecond line."
	for _, rules := range []string{
		`<font color=(.*?)>(.*?)</font>\t$2\n<HEB>(.*?)<heb>\t$1`,
		"<font color=(.*?)>(.*?)</font>\t$2\r\n<HEB>(.*?)<heb>\t$1",
	} {
		p := filepath.Join(t.TempDir(), "synthetic.bbl.mybible.gz")
		db, err := sql.Open("sqlite", p)
		if err != nil {
			t.Fatal(err)
		}
		_, err = db.Exec(`CREATE TABLE Details(Title TEXT,Abbreviation TEXT,Comments TEXT,VerseRules TEXT);
CREATE TABLE Bible(Book INTEGER,Chapter INTEGER,Verse INTEGER,Scripture TEXT)`)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec("INSERT INTO Details VALUES(?,?,?,?)", "Synthetic", "SYN", "CC0 self-authored fixture", rules); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec("INSERT INTO Bible VALUES(43,3,1,?)", `Synthetic é <font color=red>[supplied]</font> <HEB>שָׁלוֹם<heb><RF>Excluded note<Rf><CI>Second line.`); err != nil {
			t.Fatal(err)
		}
		db.Close()
		plain, err := Parse(context.Background(), p, filepath.Base(p), canonForTest(t))
		if err != nil || plain.Records[0].Text != expected {
			t.Fatal("already decoded .gz database rejected or text changed", err)
		}
		body, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		compressed := gzipFixture(t, "synthetic.bbl.mybible", body)
		wrapped := parseForTest(t, "compressed.gz", string(compressed))
		if wrapped.Fingerprint != plain.Fingerprint || wrapped.Records[0].Text != expected || wrapped.SourceHash != fmt.Sprintf("%x", sha256.Sum256(compressed)) {
			t.Fatal("compressed and HTTP-decoded source identities differ")
		}
	}
	for _, rules := range []string{
		"Synthetic\tRewritten scripture",
		`<font color=(.*?)>(.*?)</font>\t$1`,
		`<HEB>(.*?)<heb>\tPREFIX$1`,
		`<font color=(.*?)>(.*?)</font>\t$2\nunknown\trewrite`,
	} {
		if supportedMySwordRules(rules) {
			t.Fatal("arbitrary scripture replacement rule accepted", rules)
		}
	}
}

func TestGZIPPreservesContentAndNeverUsesHeaderAsAPath(t *testing.T) {
	const source = `<XMLBIBLE biblename="Synthetic"><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="1">Self-authored é [sample].<BR/>Next line.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
	plain := parseForTest(t, "synthetic.xml", source)
	for _, name := range []string{"", "../../outside.xml", `C:\outside.xml`} {
		root := t.TempDir()
		compressed := gzipFixture(t, name, []byte(source))
		p := filepath.Join(root, "input.gz")
		if err := os.WriteFile(p, compressed, 0600); err != nil {
			t.Fatal(err)
		}
		d, err := Parse(context.Background(), p, "synthetic.xml.gz", canonForTest(t))
		if err != nil || d.Fingerprint != plain.Fingerprint {
			t.Fatal("GZIP content mismatch", err)
		}
		entries, _ := os.ReadDir(root)
		if len(entries) != 1 || entries[0].Name() != "input.gz" {
			t.Fatal("temporary extraction escaped or was not cleaned")
		}
	}
	// The inner header can supply the fixed-line format when the download has a
	// generic filename. Only synthetic text is used for all 7,957 NT positions.
	nt := strings.Repeat("Self-authored synthetic line.\n", 7957) + "title=Synthetic NT\nabout=CC0\n"
	d := parseForTest(t, "download.gz", string(gzipFixture(t, "synthetic.nt", []byte(nt))))
	if d.Format != "theword" || d.Books != 27 || d.Chapters != 260 {
		t.Fatal("GZIP lost theWord format hint")
	}
}

func TestGZIPRejectsCorruptionExtraMembersAndNestedArchives(t *testing.T) {
	valid := gzipFixture(t, "synthetic.xml", []byte(`<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">Synthetic</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`))
	corrupt := bytes.Clone(valid)
	corrupt[len(corrupt)-8] ^= 0xff
	var zipBytes bytes.Buffer
	zw := zip.NewWriter(&zipBytes)
	f, _ := zw.Create("synthetic.xml")
	_, _ = f.Write([]byte("Synthetic"))
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		data []byte
		code string
	}{
		{"checksum", corrupt, "INVALID_CONTENT"},
		{"truncated", valid[:len(valid)-4], "INVALID_CONTENT"},
		{"members", append(bytes.Clone(valid), valid...), "FORMAT_AMBIGUOUS"},
		{"trailing", append(bytes.Clone(valid), 'x'), "FORMAT_AMBIGUOUS"},
		{"gzip-in-gzip", gzipFixture(t, "synthetic.xml", valid), "FORMAT_UNSUPPORTED"},
		{"zip-in-gzip", gzipFixture(t, "synthetic.xml", zipBytes.Bytes()), "FORMAT_UNSUPPORTED"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := fileForTest(t, "bad.gz", string(tc.data))
			_, err := Parse(context.Background(), p, "bad.gz", canonForTest(t))
			if code, _ := Describe(err); code != tc.code {
				t.Fatalf("got %v, expected %s", err, tc.code)
			}
			entries, _ := os.ReadDir(filepath.Dir(p))
			if len(entries) != 1 {
				t.Fatal("failed decompression retained staging files")
			}
		})
	}
}

func TestGZIPResourceLimitAndCancellationCleanStaging(t *testing.T) {
	compressed := gzipFixture(t, "synthetic.xml", []byte(strings.Repeat("x", 8192)))
	root := t.TempDir()
	_, _, err := unpackGZIP(context.Background(), bytes.NewReader(compressed), root, 1024)
	if code, _ := Describe(err); code != "IMPORT_LIMIT" {
		t.Fatal("expansion limit ignored", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err = unpackGZIP(ctx, bytes.NewReader(compressed), root, 1024)
	if code, _ := Describe(err); code != "IMPORT_CANCELLED" {
		t.Fatal("cancelled decompression continued", err)
	}
	entries, _ := os.ReadDir(root)
	if len(entries) != 0 {
		t.Fatal("failed decompression retained staging files")
	}
}
