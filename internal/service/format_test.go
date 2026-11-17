package service

import (
	"encoding/json"
	"github.com/xibolun/bible/internal/bible"
	"os"
	"strings"
	"testing"
)

func TestUserPassageFormatExamples(t *testing.T) {
	var fixture struct {
		Book        bible.Book
		Chapter     int
		Translation bible.Translation
		Verses      []bible.Verse
		Cases       []struct {
			Style    string
			Expected string
		}
	}
	raw, err := os.ReadFile("../../testdata/passage-formats.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, sample := range fixture.Cases {
		t.Run(sample.Style, func(t *testing.T) {
			options := CopyOptions{ReferenceStyle: sample.Style, ReferencePosition: "after", UILanguage: "zh-CN"}
			line := formatPassage(fixture.Book, fixture.Chapter, fixture.Verses, fixture.Translation, options)
			if got := passageText(line); got != sample.Expected {
				t.Fatalf("wanted %q, got %q", sample.Expected, got)
			}
		})
	}
	s, desktop := fixtureService(t, fixture.Book, fixture.Translation, fixture.Verses)
	selection := Selection{TranslationID: "cuv", DataVersion: "test", BookID: "ECC", Chapter: 1, Spans: []Span{{VerseKey: "6", Start: 0, End: len([]rune(fixture.Verses[0].Text))}, {VerseKey: "7", Start: 0, End: len([]rune(fixture.Verses[1].Text))}}}
	for _, sample := range fixture.Cases {
		options := CopyOptions{ReferenceStyle: sample.Style}
		if !s.CopySelection(selection, "textWithReference", nil, options).OK || desktop.text != sample.Expected {
			t.Fatalf("copy disagrees for %s: %s", sample.Style, desktop.text)
		}
		card := s.GetCard(selection, []string{"cuv"}, true, options)
		if !card.OK || len(card.Data.Lines) != 1 || passageText(card.Data.Lines[0]) != sample.Expected {
			t.Fatalf("card disagrees for %s: %+v", sample.Style, card)
		}
	}
	if s.CopySelection(selection, "textWithReference", nil, CopyOptions{ReferenceStyle: "unknown"}).OK {
		t.Fatal("invalid style accepted")
	}
	before := formatPassage(fixture.Book, fixture.Chapter, fixture.Verses, fixture.Translation, CopyOptions{ReferenceStyle: "short-version", ReferencePosition: "before", UILanguage: "en"})
	if !strings.HasPrefix(passageText(before), "ECC 1:6–7·CUV\n") {
		t.Fatal(passageText(before))
	}
}

func fixtureService(t *testing.T, book bible.Book, translation bible.Translation, verses []bible.Verse) (*Service, *fakeDesktop) {
	t.Helper()
	s, desktop := fixture(t)
	s.Data = &bible.Dataset{Books: []bible.Book{book}, Translations: []bible.Translation{translation}, Chapters: map[string][]bible.Verse{"cuv/ECC/1": verses}}
	return s, desktop
}
