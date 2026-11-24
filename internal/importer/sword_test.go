package importer

import (
	"archive/zip"
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Self-authored CC0 fixture, not a distributed Bible. The sparse index is full
// length because SWORD retains empty slots even for a single-book edition.
func swordFixture(t *testing.T, blockType string) map[string][]byte {
	t.Helper()
	files := map[string][]byte{"mods.d/synthetic.conf": []byte("[SYN]\nModDrv=zText\nCompressType=ZIP\nBlockType=" + blockType + "\nEncoding=UTF-8\nSourceType=OSIS\nVersification=KJV\nDataPath=./modules/texts/ztext/synthetic/\nDescription=Synthetic edition\nLang=zh\nVersion=1.2\nDistributionLicense=CC0\nAbout=Self-authored fixture\\parKeep this notice\nTextSource=https://example.invalid/synthetic\n")}
	prefix := map[string]string{"BOOK": "b", "CHAPTER": "c", "VERSE": "v"}[blockType]
	for _, testament := range []string{"ot", "nt"} {
		refs, err := kjvReferences(canonForTest(t), "."+testament, true)
		if err != nil {
			t.Fatal(err)
		}
		index := make([]byte, len(refs)*10)
		var raw bytes.Buffer
		for slot, ref := range refs {
			text := ""
			if slot < 4 {
				text = "<title>Excluded introduction</title>"
			}
			if testament == "ot" && ref.Book == "GEN" && ref.Chapter == 1 && ref.Label == "1" {
				text = `<w lemma="strong:H1">[晨光]</w>é<note>excluded footnote</note><hi>照耀</hi><lb/>第二行。`
			}
			if testament == "nt" && ref.Book == "MAT" && ref.Chapter == 1 && ref.Label == "1" {
				text = `<w>First</w><note><reference>excluded</reference></note><w>words</w> &amp; punctuation.`
			}
			if slot == len(refs)-1 {
				text = "Last words."
			}
			if text == "" {
				continue
			}
			binary.LittleEndian.PutUint32(index[slot*10+4:], uint32(raw.Len()))
			binary.LittleEndian.PutUint16(index[slot*10+8:], uint16(len(text)))
			raw.WriteString(text)
		}
		var compressed bytes.Buffer
		w := zlib.NewWriter(&compressed)
		_, _ = w.Write(raw.Bytes())
		_ = w.Close()
		blocks := make([]byte, 12)
		binary.LittleEndian.PutUint32(blocks[4:], uint32(compressed.Len()))
		binary.LittleEndian.PutUint32(blocks[8:], uint32(raw.Len()))
		stem := "modules/texts/ztext/synthetic/" + testament + "." + prefix + "z"
		files[stem+"v"], files[stem+"s"], files[stem+"z"] = index, blocks, compressed.Bytes()
	}
	return files
}

func swordArchive(t *testing.T, files map[string][]byte) string {
	t.Helper()
	var buffer bytes.Buffer
	w := zip.NewWriter(&buffer)
	for name, data := range files {
		entry, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "edition.zip")
	if err := os.WriteFile(file, buffer.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestSwordZIPPreservesIndexTextNoticesAndLinks(t *testing.T) {
	for _, blockType := range []string{"BOOK", "CHAPTER", "VERSE"} {
		t.Run(blockType, func(t *testing.T) {
			files := swordFixture(t, blockType)
			prefix := map[string]string{"BOOK": "b", "CHAPTER": "c", "VERSE": "v"}[blockType]
			index := files["modules/texts/ztext/synthetic/nt."+prefix+"zv"]
			copy(index[5*10:6*10], index[4*10:5*10]) // Matthew 1:1-2 share one source record.
			d, err := Parse(context.Background(), swordArchive(t, files), "misleading.xml", canonForTest(t))
			if err != nil {
				t.Fatal(err)
			}
			if d.Format != "sword" || d.Abbreviation != "SYN" || d.Name != "Synthetic edition" || d.SourceEdition != "1.2" || d.Versification != "KJV" || !strings.Contains(d.License, "Keep this notice") || d.SourceHash == "" {
				t.Fatalf("incorrect metadata: %+v", d)
			}
			want := []Record{{"GEN", 1, "1", "[晨光]é照耀\n第二行。"}, {"MAL", 4, "6", "Last words."}, {"MAT", 1, "1-2", "First words & punctuation."}, {"REV", 22, "21", "Last words."}}
			if fmt.Sprint(d.Records) != fmt.Sprint(want) || d.Books != 4 || d.Chapters != 4 || d.Verses != 4 {
				t.Fatalf("incorrect verses: %#v", d.Records)
			}
		})
	}
}

func TestSwordRejectsInvalidProfilesAndIndexes(t *testing.T) {
	stem := "modules/texts/ztext/synthetic/nt.bz"
	cases := []struct {
		name, code string
		mutate     func(map[string][]byte)
	}{
		{"driver", "FORMAT_UNSUPPORTED", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = bytes.ReplaceAll(f["mods.d/synthetic.conf"], []byte("zText"), []byte("zText4"))
		}},
		{"encoding", "FORMAT_UNSUPPORTED", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = bytes.ReplaceAll(f["mods.d/synthetic.conf"], []byte("UTF-8"), []byte("Latin-1"))
		}},
		{"versification", "REFERENCE_UNSUPPORTED", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = bytes.ReplaceAll(f["mods.d/synthetic.conf"], []byte("=KJV"), []byte("=LXX"))
		}},
		{"encrypted", "ENCRYPTED_MODULE", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = append(f["mods.d/synthetic.conf"], []byte("CipherKey=\n")...)
		}},
		{"transform", "FORMAT_UNSUPPORTED", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = append(f["mods.d/synthetic.conf"], []byte("LocalOptionFilter=Unknown\n")...)
		}},
		{"path", "INVALID_CONTENT", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = bytes.ReplaceAll(f["mods.d/synthetic.conf"], []byte("./modules/texts/ztext/synthetic/"), []byte("./modules/../secret/"))
		}},
		{"duplicate key", "INVALID_CONTENT", func(f map[string][]byte) {
			f["mods.d/synthetic.conf"] = append(f["mods.d/synthetic.conf"], []byte("ModDrv=zText\n")...)
		}},
		{"multiple modules", "FORMAT_AMBIGUOUS", func(f map[string][]byte) { f["mods.d/second.conf"] = f["mods.d/synthetic.conf"] }},
		{"mixed resources", "FORMAT_AMBIGUOUS", func(f map[string][]byte) { f["second.xml"] = []byte("<XMLBIBLE/>") }},
		{"missing file", "INVALID_CONTENT", func(f map[string][]byte) { delete(f, stem+"v") }},
		{"wrong slot count", "REFERENCE_UNSUPPORTED", func(f map[string][]byte) { f[stem+"v"] = f[stem+"v"][:100] }},
		{"block index size", "INVALID_CONTENT", func(f map[string][]byte) { f[stem+"s"] = []byte{0} }},
		{"block bounds", "INVALID_CONTENT", func(f map[string][]byte) { binary.LittleEndian.PutUint32(f[stem+"s"], ^uint32(0)) }},
		{"verse bounds", "INVALID_CONTENT", func(f map[string][]byte) { binary.LittleEndian.PutUint32(f[stem+"v"][4*10+4:], ^uint32(0)) }},
		{"verse block", "INVALID_CONTENT", func(f map[string][]byte) { binary.LittleEndian.PutUint32(f[stem+"v"][4*10:], 5) }},
		{"zlib checksum", "INVALID_CONTENT", func(f map[string][]byte) { f[stem+"z"][len(f[stem+"z"])-1] ^= 1 }},
		{"zlib truncated", "INVALID_CONTENT", func(f map[string][]byte) { f[stem+"z"] = f[stem+"z"][:len(f[stem+"z"])-1] }},
		{"zlib length mismatch", "INVALID_CONTENT", func(f map[string][]byte) { binary.LittleEndian.PutUint32(f[stem+"s"][8:], 1) }},
		{"zlib trailing data", "INVALID_CONTENT", func(f map[string][]byte) {
			f[stem+"z"] = append(f[stem+"z"], 0)
			binary.LittleEndian.PutUint32(f[stem+"s"][4:], uint32(len(f[stem+"z"])))
		}},
		{"expansion limit", "IMPORT_LIMIT", func(f map[string][]byte) { binary.LittleEndian.PutUint32(f[stem+"s"][8:], 33<<20) }},
		{"nonzero padding", "INVALID_CONTENT", func(f map[string][]byte) {
			padding := make([]byte, 1024)
			padding[1023] = 1
			f[stem+"z"] = append(f[stem+"z"], padding...)
			binary.LittleEndian.PutUint32(f[stem+"s"][4:], uint32(len(f[stem+"z"])))
		}},
		{"disjoint link", "REFERENCE_UNSUPPORTED", func(f map[string][]byte) { copy(f[stem+"v"][6*10:7*10], f[stem+"v"][4*10:5*10]) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			files := swordFixture(t, "BOOK")
			tc.mutate(files)
			_, err := Parse(context.Background(), swordArchive(t, files), "test.zip", canonForTest(t))
			if code, _ := Describe(err); code != tc.code {
				t.Fatalf("expected %s, got %v", tc.code, err)
			}
		})
	}
}

func TestSwordOSISRejectsUnknownAndUnsafeFragments(t *testing.T) {
	for _, text := range []string{"<unknown>words</unknown>", "<!DOCTYPE x>words", "<?xml version=\"1.0\"?>words", "&unknown;", "<note>unclosed", "<note><hi>wrong</note></hi>", "<q marker=\"‘\">generated</q>", "<x:w>unknown namespace</x:w>", "bad\x00text", "bad\xffencoding"} {
		if _, err := swordOSIS(context.Background(), []byte(text)); err == nil {
			t.Fatalf("accepted %q", text)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := swordOSIS(ctx, []byte("words")); err != context.Canceled {
		t.Fatal("ignored cancellation", err)
	}
}

func TestKJVReferenceIndexIndependentOfBundledEditions(t *testing.T) {
	canon := *canonForTest(t)
	canon.Chapters = nil
	for _, tc := range []struct {
		testament     string
		verses, slots int
	}{{".ot", 23145, 24115}, {".nt", 7957, 8246}} {
		for _, intros := range []bool{false, true} {
			refs, err := kjvReferences(&canon, tc.testament, intros)
			want := tc.verses
			if intros {
				want = tc.slots
			}
			if err != nil || len(refs) != want {
				t.Fatalf("index %s: %d, %v", tc.testament, len(refs), err)
			}
		}
	}
}
