package bible

import (
	"strings"
	"testing"
)

func TestBundledCanonAndSourceSamples(t *testing.T) {
	d, e := Load()
	if e != nil {
		t.Fatal(e)
	}
	if len(d.Books) != 66 || len(d.Translations) != 3 || len(d.Chapters) != 1189*len(d.Translations) {
		t.Fatal("incomplete canon")
	}
	for _, tr := range d.Translations {
		for _, b := range d.Books {
			for c := 1; c <= b.Chapters; c++ {
				verses, ok := d.Chapters[ChapterKey(tr.ID, b.ID, c)]
				if !ok || len(verses) == 0 {
					t.Fatalf("missing %s %s %d", tr.ID, b.ID, c)
				}
				seen := map[string]bool{}
				for _, v := range verses {
					if seen[v.Label] || v.Text == "" {
						t.Fatal("duplicate/empty verse")
					}
					seen[v.Label] = true
				}
			}
		}
	}
	for _, sample := range []struct {
		tr, book    string
		ch          int
		verse, want string
	}{{"cuv", "GEN", 1, "1", "起初"}, {"webp", "GEN", 1, "1", "In the beginning"}, {"cuv", "PSA", 23, "1", "耶和华"}, {"webp", "JHN", 3, "16", "God so loved"}, {"cuv", "REV", 22, "21", "主耶稣"}, {"kjv", "GEN", 1, "1", "In the beginning God created the heaven and the earth."}, {"kjv", "JHN", 3, "16", "only begotten Son"}, {"kjv", "REV", 22, "21", "Amen."}} {
		v, ok := d.Verse(sample.tr, sample.book, sample.ch, sample.verse)
		if !ok || !strings.Contains(v.Text, sample.want) {
			t.Fatalf("source sample mismatch: %+v %q", sample, v.Text)
		}
	}
}

func TestKJVAndWEBPKeepActualMissingVerseGap(t *testing.T) {
	d, e := Load()
	if e != nil {
		t.Fatal(e)
	}
	chapter, e := d.Align([]string{"kjv", "webp"}, "ACT", 8)
	if e != nil {
		t.Fatal(e)
	}
	checked := 0
	for _, row := range chapter.Rows {
		if row.Label == "37" {
			if row.Cells[0].Missing || !row.Cells[1].Missing || !strings.Contains(row.Cells[0].Text, "believest") {
				t.Fatalf("source gap lost: %+v", row)
			}
			checked++
		}
		if row.Label == "38" {
			for index, id := range []string{"kjv", "webp"} {
				verse, ok := d.Verse(id, "ACT", 8, "38")
				if !ok || row.Cells[index].Text != verse.Text {
					t.Fatalf("verse shifted for %s", id)
				}
			}
			checked++
		}
	}
	if checked != 2 {
		t.Fatal("missing source comparison rows")
	}
}

func TestAlignmentDoesNotShiftMissingOrSuffixedVerses(t *testing.T) {
	d := &Dataset{Books: []Book{{ID: "GEN", Chapters: 1}}, Translations: []Translation{{ID: "a"}, {ID: "b"}}, Chapters: map[string][]Verse{"a/GEN/1": {{"1", "one"}, {"3", "three"}, {"3a", "suffix"}}, "b/GEN/1": {{"1", "uno"}, {"2", "dos"}, {"3", "tres"}}}}
	c, e := d.Align([]string{"a", "b"}, "GEN", 1)
	if e != nil {
		t.Fatal(e)
	}
	if len(c.Rows) != 4 || c.Rows[1].Label != "2" || !c.Rows[1].Cells[0].Missing || c.Rows[2].Cells[0].Text != "three" || c.Rows[3].Label != "3a" {
		t.Fatalf("bad alignment %+v", c)
	}
	if _, e = d.Align([]string{"a", "a"}, "GEN", 1); e == nil {
		t.Fatal("duplicate versions accepted")
	}
	if _, e = d.Align([]string{"a"}, "GEN", 2); e == nil {
		t.Fatal("invalid chapter accepted")
	}
}
