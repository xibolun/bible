package bible

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestGroupedReferencesPreserveOrderAndRejectPartialOrExcessiveInput(t *testing.T) {
	data, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, reference := range []string{"创３:１５-１６；约３:１６", "GEN3:15-16+JHN3:16", "GEN3:15-16\r\nJHN3:16"} {
		passages, err := data.ResolveReferences(reference, "cuv")
		if err != nil || len(passages) != 2 || passages[0].Book.ID != "GEN" || passages[1].Book.ID != "JHN" || passages[1].Verses[0].Label != "16" {
			t.Fatalf("wrong grouped reference %q: %v", reference, err)
		}
	}
	for _, reference := range []string{"GEN3:15-16;JHN99:16", "GEN3:15-16;", ";GEN3:15", "GEN3:15;;JHN3:16", strings.Repeat("GEN1:1;", 12) + "GEN1:1", strings.Repeat("PSA119;", 3) + "PSA119", strings.Repeat("a", 4097)} {
		if passages, err := data.ResolveReferences(reference, "cuv"); err == nil || passages != nil {
			t.Errorf("partial/invalid group accepted: %q", reference)
		}
	}
}

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
			p, err := data.ResolveReference(sample.Input, func() string {
				if sample.Translation == "webp" {
					return "cuv"
				}
				return sample.Translation
			}())
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
	delete(data.Chapters, "cuv/GEN/1")
	if _, err := data.ResolveReference("GEN1", "cuv"); err == nil {
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
