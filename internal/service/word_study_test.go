package service

import (
	"strings"
	"testing"

	"github.com/xibolun/bible/internal/bible"
)

func TestOfflineOriginalWordStudy(t *testing.T) {
	data, err := bible.Load()
	if err != nil {
		t.Fatal(err)
	}
	s := New(data, nil, nil)
	for _, code := range []string{" h00430 ", "g03056"} {
		r := s.LookupWord(code)
		if !r.OK || r.Data.Lemma == "" || r.Data.Definition == "" || r.Data.ChineseDefinition == "" || r.Data.ChineseSource == "" {
			t.Fatalf("missing entry %s: %+v", code, r)
		}
	}
	if entry := s.LookupWord("G3056"); entry.Data.Lemma != "λόγος" || !strings.Contains(entry.Data.Definition, "word") {
		t.Fatalf("unexpected Greek entry: %+v", entry.Data)
	}
	if entry := s.LookupWord("G3056"); !strings.Contains(entry.Data.ChineseDefinition, "話語") || !strings.Contains(s.LookupWord("H430").Data.ChineseDefinition, "神") {
		t.Fatal("missing licensed Chinese definitions")
	}
	for _, sample := range []struct{ book, code string }{{"GEN", "H430"}, {"JHN", "G3056"}} {
		r := s.GetVerseWords(sample.book, 1, "1")
		if !r.OK || len(r.Data.Words) == 0 {
			t.Fatalf("missing verse words: %+v", r)
		}
		found := false
		for _, entry := range r.Data.Entries {
			found = found || entry.ID == sample.code
		}
		if !found {
			t.Fatalf("missing linked entry %s", sample.code)
		}
	}
	for _, code := range []string{"", "430", "G-1", "H430<script>", strings.Repeat("H", 200)} {
		if result := s.LookupWord(code); result.OK || result.Error.Code != "INVALID_WORD" {
			t.Fatalf("accepted invalid code %q", code)
		}
	}
	if result := s.LookupWord("H99999"); result.OK || result.Error.Code != "WORD_NOT_FOUND" {
		t.Fatal("unknown entry reported as valid")
	}
	for _, ref := range []struct {
		book    string
		chapter int
		verse   string
	}{{"BAD", 1, "1"}, {"GEN", 0, "1"}, {"GEN", 51, "1"}, {"GEN", 1, "999"}, {"GEN", 1, "../1"}} {
		if result := s.GetVerseWords(ref.book, ref.chapter, ref.verse); result.OK || result.Error.Code != "INVALID_REFERENCE" {
			t.Fatalf("accepted invalid verse %+v", ref)
		}
	}
}
