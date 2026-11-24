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
	quit   bool
	text   string
	fail   bool
	cancel bool
	bytes  []byte
}

func (f *fakeDesktop) Quit() error {
	if f.fail {
		return errors.New("desktop unavailable")
	}
	f.quit = true
	return nil
}

func TestQuitRequestsDesktopAndReportsUnavailableService(t *testing.T) {
	s, desktop := fixture(t)
	if result := s.Quit(); !result.OK || !desktop.quit {
		t.Fatal("quit was not requested")
	}
	desktop.fail = true
	if result := s.Quit(); result.OK || result.Error.Code != "BRIDGE_UNAVAILABLE" {
		t.Fatal("failed quit reported success")
	}
	s.Desktop = nil
	if result := s.Quit(); result.OK || result.Error.Code != "BRIDGE_UNAVAILABLE" {
		t.Fatal("missing desktop reported success")
	}
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

func TestRemovedBuiltInEditionsRepairPreferences(t *testing.T) {
	s, _ := fixture(t)
	data, err := bible.Load()
	if err != nil {
		t.Fatal(err)
	}
	s.Data = data
	p := Defaults()
	p.Translations = []string{"dby", "kjv", "webp"}
	p.Parallel = true
	p.BookID, p.Chapter, p.FontSize = "JHN", 3, 24
	p.SearchHistory = []SearchHistoryEntry{{TranslationID: "kjv", Pattern: "words"}, {TranslationID: "webp", Pattern: "God"}}
	if err := s.Store.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	read := s.GetPreferences()
	if !read.OK || len(read.Data.Translations) != 1 || read.Data.Translations[0] != "webp" || read.Data.BookID != "JHN" || read.Data.Chapter != 3 || read.Data.FontSize != 24 || len(read.Data.SearchHistory) != 1 {
		t.Fatalf("legacy preferences not repaired: %+v", read)
	}
	p.Translations = []string{"dby", "kjv"}
	if err := s.Store.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	read = s.GetPreferences()
	if !read.OK || read.Data.Translations[0] != "cuv" {
		t.Fatal("no available edition fallback", read.Error)
	}
}

func TestUnicodeSelectionPersistenceAndCopy(t *testing.T) {
	s, desk := fixture(t)
	sel := selected()
	r := s.ApplyHighlight("unique-request", sel, "purple")
	if !r.OK || len(*r.Data) != 1 {
		t.Fatalf("%+v", r.Error)
	}
	if !s.CopySelection(sel, "textWithReference", nil, CopyOptions{}).OK || !strings.Contains(desk.text, "😀é中\n— 创世记1:1·CUV") {
		t.Fatal(desk.text)
	}
	if !s.CopySelection(sel, "parallelVerse", []string{"cuv", "webp"}, CopyOptions{}).OK || !strings.Contains(desk.text, "An English verse.") {
		t.Fatal(desk.text)
	}
	desk.fail = true
	fail := s.CopySelection(sel, "textWithReference", nil, CopyOptions{})
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
	if result := s.CopySelection(sel, "parallelVerse", []string{"cuv", "kjv"}, CopyOptions{}); !result.OK || !strings.Contains(desktop.text, "King James wording.\n— 创世记1:1·KJV") || strings.Contains(desktop.text, "WEBP") || strings.Contains(desktop.text, "An English verse.") {
		t.Fatalf("wrong pair copied: %s", desktop.text)
	}
	card := s.GetCard(sel, []string{"cuv", "kjv"}, true, CopyOptions{})
	if !card.OK || len(card.Data.Lines) != 2 || card.Data.Lines[1].Version != "KJV" || card.Data.Lines[1].Text != "King James wording." {
		t.Fatalf("wrong pair in card: %+v", card)
	}
	if !s.CopySelection(sel, "parallelVerse", []string{"cuv", "webp", "kjv"}, CopyOptions{ReferencePosition: "before"}).OK || !strings.HasPrefix(desktop.text, "创世记1:1·CUV\n") || !strings.Contains(desktop.text, "An English verse.") {
		t.Fatalf("three-version reference copy failed: %s", desktop.text)
	}
	for _, ids := range [][]string{{"cuv", "webp", "kjv", "cuv"}, {"cuv", "cuv"}, {"cuv", "missing"}, {"webp", "kjv"}} {
		if s.CopySelection(sel, "parallelVerse", ids, CopyOptions{}).OK {
			t.Fatalf("invalid pair accepted: %v", ids)
		}
	}
}

func TestCardValidationAndCancellation(t *testing.T) {
	s, desk := fixture(t)
	sel := selected()
	c := s.GetCard(sel, []string{"cuv", "webp"}, true, CopyOptions{})
	if !c.OK || len(c.Data.Lines) != 2 {
		t.Fatal(c.Error)
	}
	if s.GetCard(sel, []string{"webp"}, false, CopyOptions{}).OK {
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

func TestLegacyPreferencesAndNewSettingsPersistWithoutLosingAnnotations(t *testing.T) {
	s, _ := fixture(t)
	if !s.ApplyHighlight("settings-highlight", selected(), "green").OK {
		t.Fatal("highlight setup failed")
	}
	legacy := map[string]any{"bookId": "GEN", "chapter": 1, "translations": []string{"webp", "cuv"}, "parallel": true, "fontSize": 24, "topVerse": "2", "scrollOffset": 12}
	if err := s.Store.SavePreferences(legacy); err != nil {
		t.Fatal(err)
	}
	result := s.GetPreferences()
	if !result.OK || result.Data.ReadingTheme != "light" || result.Data.ReferencePosition != "after" || result.Data.UILanguage != "zh-CN" || result.Data.FontSize != 24 || result.Data.TopVerse != "2" || result.Data.Translations[0] != "webp" {
		t.Fatalf("legacy preferences reset: %+v", result)
	}
	p := *result.Data
	if p.GlobalFontSize != 13 || p.ChapterNumerals != "arabic" || p.ReferenceBrackets != "none" {
		t.Fatal("legacy typography/reference defaults lost")
	}
	if p.SearchHistory == nil || len(p.SearchHistory) != 0 {
		t.Fatal("legacy preferences did not default to empty history")
	}
	p.ReferencePosition = "before"
	p.UILanguage = "en"
	p.FontSize = 32
	p.ReadingTheme = "sage"
	p.GlobalFontSize = 20
	p.ChapterNumerals = "chinese"
	p.ReferenceBrackets = "book"
	p.SearchHistory = []SearchHistoryEntry{{TranslationID: "webp", Pattern: "God%world"}}
	if !s.SavePreferences(p).OK {
		t.Fatal("new settings rejected")
	}
	read := s.GetPreferences()
	if !read.OK || read.Data.ReadingTheme != "sage" || read.Data.ReferencePosition != "before" || read.Data.UILanguage != "en" || read.Data.TopVerse != "2" || read.Data.FontSize != 32 || len(read.Data.SearchHistory) != 1 || read.Data.SearchHistory[0] != p.SearchHistory[0] {
		t.Fatal("settings not persisted")
	}
	marks := s.ListHighlights([]string{"cuv"}, "GEN", 1)
	if read.Data.GlobalFontSize != 20 || read.Data.ChapterNumerals != "chinese" || read.Data.ReferenceBrackets != "book" {
		t.Fatal("typography/reference settings not persisted")
	}
	if !marks.OK || len(*marks.Data) != 1 || (*marks.Data)[0].Color != "green" {
		t.Fatal("settings changed annotations")
	}
	for _, change := range []func(*Preferences){func(p *Preferences) { p.ReferencePosition = "middle" }, func(p *Preferences) { p.UILanguage = "unknown" }, func(p *Preferences) { p.FontSize = 33 }, func(p *Preferences) { p.Translations = []string{"cuv", "cuv"} }} {
		invalid := p
		change(&invalid)
		if s.SavePreferences(invalid).OK {
			t.Fatal("invalid settings accepted")
		}
	}
	p.ReadingTheme = "unknown"
	if s.SavePreferences(p).OK {
		t.Fatal("invalid theme accepted")
	}
}

func TestSearchHistoryValidationAndClearing(t *testing.T) {
	s, _ := fixture(t)
	p := Defaults()
	for _, history := range [][]SearchHistoryEntry{
		{{TranslationID: "unknown", Pattern: "God"}},
		{{TranslationID: "cuv", Pattern: "bad\\"}},
		{{TranslationID: "cuv", Pattern: ""}},
		make([]SearchHistoryEntry, 21),
	} {
		p.SearchHistory = history
		if s.SavePreferences(p).OK {
			t.Fatal("invalid search history accepted")
		}
	}
	p.SearchHistory = []SearchHistoryEntry{{TranslationID: "cuv", Pattern: `神%\\%`}}
	if !s.SavePreferences(p).OK {
		t.Fatal("valid history rejected")
	}
	p.SearchHistory = []SearchHistoryEntry{}
	if !s.SavePreferences(p).OK || len(s.GetPreferences().Data.SearchHistory) != 0 {
		t.Fatal("history clear not persisted")
	}
}

func TestTypographyAndReferencePreferencesValidate(t *testing.T) {
	s, _ := fixture(t)
	for _, change := range []func(*Preferences){func(p *Preferences) { p.GlobalFontSize = 10 }, func(p *Preferences) { p.GlobalFontSize = 21 }, func(p *Preferences) { p.ChapterNumerals = "roman" }, func(p *Preferences) { p.ReferenceBrackets = "angle" }} {
		p := Defaults()
		change(&p)
		if s.SavePreferences(p).OK {
			t.Fatal("invalid typography/reference preferences accepted")
		}
	}
}

func TestCopyAlwaysIncludesReferenceAndHonorsPositionAndLanguage(t *testing.T) {
	s, desktop := fixture(t)
	s.Data.Books[0].EnglishName = "Genesis"
	sel := selected()
	sel.Spans = []Span{{VerseKey: "1", Start: 0, End: 6}, {VerseKey: "2", Start: 0, End: 3}}
	options := CopyOptions{ReferencePosition: "before", UILanguage: "en"}
	if !s.CopySelection(sel, "textWithReference", nil, options).OK || !strings.HasPrefix(desktop.text, "Genesis 1:1–2·CUV\nA😀é中B\n第二节") {
		t.Fatal(desktop.text)
	}
	options.ReferencePosition = "after"
	if !s.CopySelection(sel, "parallelVerse", []string{"cuv", "webp"}, options).OK || !strings.HasSuffix(desktop.text, "\n— Genesis 1:1–2·WEBP") || !strings.Contains(desktop.text, "An English verse.\nSecond verse.") {
		t.Fatal(desktop.text)
	}
	if s.CopySelection(sel, "textOnly", nil, CopyOptions{}).OK {
		t.Fatal("reference-free copy remained available")
	}
	if s.CopySelection(sel, "textWithReference", nil, CopyOptions{ReferencePosition: "middle"}).OK {
		t.Fatal("invalid reference position accepted")
	}
}
