package bible

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestLikeSearchExamples(t *testing.T) {
	var examples []struct {
		Text, Pattern string
		Match         bool
	}
	raw, err := os.ReadFile("../../testdata/scripture-search.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	for _, sample := range examples {
		pattern, err := likePattern(sample.Pattern)
		if err != nil {
			t.Fatal(err)
		}
		if got := likeMatch(sample.Text, pattern); got != sample.Match {
			t.Errorf("%q LIKE %q = %v, want %v", sample.Text, sample.Pattern, got, sample.Match)
		}
	}
}

func TestBundledSearchPaginationAndValidation(t *testing.T) {
	d, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	page, err := d.Search("cuv", "起%神", 0, 30)
	if err != nil || len(page.Results) == 0 || page.Results[0].BookID != "GEN" || page.Results[0].Chapter != 1 || page.Results[0].VerseKey != "1" {
		t.Fatalf("missing Genesis 1:1: %+v %v", page, err)
	}
	first, _ := d.Search("cuv", "神", 0, 2)
	next, _ := d.Search("cuv", "神", 2, 2)
	all, _ := d.Search("cuv", "神", 0, 4)
	if first.Total != next.Total || len(next.Results) != 2 || next.Results[0] != all.Results[2] || first.Results[1] != all.Results[1] {
		t.Fatal("unstable search pagination")
	}
	empty, err := d.Search("cuv", "不存在的经文搜索词xyz", 0, 30)
	if err != nil || empty.Total != 0 || empty.Results == nil {
		t.Fatalf("invalid empty result: %+v", empty)
	}
	for _, pattern := range []string{"", " ", "test\\", strings.Repeat("神", 129)} {
		if _, err := d.Search("cuv", pattern, 0, 30); err == nil {
			t.Fatalf("accepted invalid pattern %q", pattern)
		}
	}
	for _, args := range [][2]int{{-1, 30}, {100001, 30}, {0, 0}, {0, 101}} {
		if _, err := d.Search("cuv", "神", args[0], args[1]); err == nil {
			t.Fatal("accepted invalid page")
		}
	}
	if _, err := d.Search("missing", "神", 0, 30); err == nil {
		t.Fatal("accepted unknown translation")
	}
}
