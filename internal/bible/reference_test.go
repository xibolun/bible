package bible

import (
	"encoding/json"
	"os"
	"testing"
)

func TestProjectionReferenceExamples(t *testing.T) {
	data, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	var cases struct {
		Valid []struct {
			Input, Translation, Book, First, Last string
			Chapter, Count                        int
		}
		Invalid []string
	}
	raw, err := os.ReadFile("../../testdata/projection-references.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, sample := range cases.Valid {
		t.Run(sample.Input, func(t *testing.T) {
			p, err := data.ResolveReference(sample.Input, sample.Translation)
			if err != nil {
				t.Fatal(err)
			}
			if p.Book.ID != sample.Book || p.Chapter != sample.Chapter || len(p.Verses) != sample.Count ||
				p.Verses[0].Label != sample.First || p.Verses[len(p.Verses)-1].Label != sample.Last {
				t.Fatalf("wrong passage: %+v", p)
			}
		})
	}
	for _, input := range cases.Invalid {
		if _, err := data.ResolveReference(input, "cuv"); err == nil {
			t.Errorf("accepted %q", input)
		}
	}
	delete(data.Chapters, "kjv/GEN/1")
	if _, err := data.ResolveReference("GEN1", "kjv"); err == nil {
		t.Fatal("missing chapter accepted")
	}
	data.Chapters["cuv/GEN/3"] = []Verse{{Label: "15", Text: "first"}, {Label: "17", Text: "last"}}
	if _, err := data.ResolveReference("GEN3:15-17", "cuv"); err == nil {
		t.Fatal("range hole substituted")
	}
	if _, err := data.ResolveReference("GEN3:15", "not-installed"); err == nil {
		t.Fatal("unknown translation accepted")
	}
}
