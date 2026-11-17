package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/png"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/storage"
)

type fakeDesktop struct {
	text   string
	fail   bool
	cancel bool
	bytes  []byte
}

func (f *fakeDesktop) Copy(s string) error {
	if f.fail {
		return errors.New("private path must not escape")
	}
	f.text = s
	return nil
}
func (f *fakeDesktop) Save(b []byte, name string) (string, error) {
	if f.fail {
		return "", errors.New("private path must not escape")
	}
	if f.cancel {
		return "", nil
	}
	f.bytes = b
	return filepath.Join("private", name), nil
}
func fixture(t *testing.T) (*Service, *fakeDesktop) {
	t.Helper()
	d := &bible.Dataset{Books: []bible.Book{{ID: "GEN", Name: "创世记", Chapters: 1}}, Translations: []bible.Translation{{ID: "cuv", DataVersion: "v1", Abbreviation: "CUV"}, {ID: "webp", DataVersion: "v1", Abbreviation: "WEBP"}}, Chapters: map[string][]bible.Verse{"cuv/GEN/1": {{Label: "1", Text: "A😀é中B"}, {Label: "2", Text: "第二节"}}, "webp/GEN/1": {{Label: "1", Text: "An English verse."}, {Label: "2", Text: "Second verse."}}}}
	store, e := storage.Open(filepath.Join(t.TempDir(), "user.db"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { store.Close() })
	desk := &fakeDesktop{}
	return New(d, store, desk), desk
}
func selected() Selection {
	return Selection{TranslationID: "cuv", DataVersion: "v1", BookID: "GEN", Chapter: 1, Spans: []Span{{VerseKey: "1", Start: 1, End: 5}}}
}

func TestUnicodeSelectionPersistenceAndCopy(t *testing.T) {
	s, desk := fixture(t)
	sel := selected()
	r := s.ApplyHighlight("unique-request", sel, "purple")
	if !r.OK || len(*r.Data) != 1 {
		t.Fatalf("%+v", r.Error)
	}
	if !s.CopySelection(sel, "textWithReference", nil).OK || !strings.Contains(desk.text, "😀é中\n— 创世记 1:1 · CUV") {
		t.Fatal(desk.text)
	}
	if !s.CopySelection(sel, "parallelVerse", []string{"cuv", "webp"}).OK || !strings.Contains(desk.text, "An English verse.") {
		t.Fatal(desk.text)
	}
	desk.fail = true
	fail := s.CopySelection(sel, "textOnly", nil)
	if fail.OK || fail.Error.Code != "CLIPBOARD_ERROR" || strings.Contains(fail.Error.Message, "private") {
		t.Fatal("clipboard failure leaked or reported success")
	}
	broken := selected()
	broken.Spans[0].End = 3
	if s.ApplyHighlight("break-cluster", broken, "yellow").OK {
		t.Fatal("split combining grapheme accepted")
	}
	stale := selected()
	stale.DataVersion = "v0"
	if s.ApplyHighlight("stale-version", stale, "yellow").Error.Code != "STALE_DATA" {
		t.Fatal("stale selection accepted")
	}
	duplicate := selected()
	duplicate.Spans = append(duplicate.Spans, duplicate.Spans[0])
	if s.ApplyHighlight("duplicate-verse", duplicate, "yellow").OK {
		t.Fatal("duplicate verse accepted")
	}
}

func TestCopyAndCardUseOnlySelectedTranslationPair(t *testing.T) {
	s, desktop := fixture(t)
	s.Data.Translations = append(s.Data.Translations, bible.Translation{ID: "kjv", DataVersion: "v1", Abbreviation: "KJV"})
	s.Data.Chapters["kjv/GEN/1"] = []bible.Verse{{Label: "1", Text: "King James wording."}}
	sel := selected()
	if result := s.CopySelection(sel, "parallelVerse", []string{"cuv", "kjv"}); !result.OK || !strings.Contains(desktop.text, "KJV\nKing James wording.") || strings.Contains(desktop.text, "WEBP") || strings.Contains(desktop.text, "An English verse.") {
		t.Fatalf("wrong pair copied: %s", desktop.text)
	}
	card := s.GetCard(sel, []string{"cuv", "kjv"}, true)
	if !card.OK || len(card.Data.Lines) != 2 || card.Data.Lines[1].Version != "KJV" || card.Data.Lines[1].Text != "King James wording." {
		t.Fatalf("wrong pair in card: %+v", card)
	}
	for _, ids := range [][]string{{"cuv", "webp", "kjv"}, {"cuv", "cuv"}, {"cuv", "missing"}, {"webp", "kjv"}} {
		if s.CopySelection(sel, "parallelVerse", ids).OK {
			t.Fatalf("invalid pair accepted: %v", ids)
		}
	}
}

func TestCardValidationAndCancellation(t *testing.T) {
	s, desk := fixture(t)
	sel := selected()
	c := s.GetCard(sel, []string{"cuv", "webp"}, true)
	if !c.OK || len(c.Data.Lines) != 2 {
		t.Fatal(c.Error)
	}
	if s.GetCard(sel, []string{"webp"}, false).OK {
		t.Fatal("partial selection wrongly transferred to other language")
	}
	var b bytes.Buffer
	if e := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 1080, 1080))); e != nil {
		t.Fatal(e)
	}
	encoded := base64.StdEncoding.EncodeToString(b.Bytes())
	desk.cancel = true
	r := s.SaveCard(encoded, 1080, 1080, "../unsafe", sel)
	if !r.OK || !r.Data.Cancelled || r.Data.Saved {
		t.Fatal(r)
	}
	desk.cancel = false
	r = s.SaveCard(encoded, 1080, 1080, "../unsafe", sel)
	if !r.OK || !r.Data.Saved || strings.Contains(r.Data.FileName, "/") {
		t.Fatal(r)
	}
	if s.SaveCard(encoded, 1080, 1920, "test", sel).OK || s.SaveCard("not png", 1080, 1080, "test", sel).OK {
		t.Fatal("invalid image accepted")
	}
	desk.fail = true
	if r = s.SaveCard(encoded, 1080, 1080, "test", sel); r.OK || r.Error.Code != "EXPORT_ERROR" {
		t.Fatal("failed save reported success")
	}
}
