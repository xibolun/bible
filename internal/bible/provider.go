package bible

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
)

// EditionProvider keeps user corpora in SQLite. Embedded data stays immutable.
type EditionProvider interface {
	Translations() []Translation
	Chapter(string, string, int) ([]Verse, error)
	Coverage(string) (map[string][]int, error)
	Walk(string, func(string, int, Verse)) error
}

// Snapshot freezes the active edition versions for a complete read operation.
func (d *Dataset) Snapshot() *Dataset {
	if p, ok := d.Provider.(interface{ Snapshot() EditionProvider }); ok {
		copy := *d
		copy.Provider = p.Snapshot()
		return &copy
	}
	return d
}

func (d *Dataset) AllTranslations() []Translation {
	d = d.Snapshot()
	out := slices.Clone(d.Translations)
	if d.Provider != nil {
		out = append(out, d.Provider.Translations()...)
	}
	return out
}
func (d *Dataset) ChapterVerses(id, book string, ch int) ([]Verse, error) {
	d = d.Snapshot()
	if d.Provider != nil && len(id) > 5 && id[:5] == "user:" {
		return d.Provider.Chapter(id, book, ch)
	}
	return d.Chapters[ChapterKey(id, book, ch)], nil
}
func (d *Dataset) AvailableBooks(ids []string) ([]Book, error) {
	d = d.Snapshot()
	if len(ids) == 0 {
		return nil, fmt.Errorf("INVALID_TRANSLATION")
	}
	coverage := map[string][]int{}
	seen := map[string]bool{}
	for _, id := range ids {
		t, ok := d.Translation(id)
		if !ok || seen[id] {
			return nil, fmt.Errorf("INVALID_TRANSLATION")
		}
		seen[id] = true
		if len(ids) > 1 && t.Origin == "user" && !t.Comparable {
			return nil, fmt.Errorf("VERSIFICATION_UNSUPPORTED")
		}
		if t.Origin == "user" {
			m, err := d.Provider.Coverage(id)
			if err != nil {
				return nil, err
			}
			for book, chapters := range m {
				coverage[book] = append(coverage[book], chapters...)
			}
		} else {
			for _, book := range d.Books {
				for n := 1; n <= book.Chapters; n++ {
					if len(d.Chapters[ChapterKey(id, book.ID, n)]) > 0 {
						coverage[book.ID] = append(coverage[book.ID], n)
					}
				}
			}
		}
	}
	out := []Book{}
	for _, book := range d.Books {
		numbers := coverage[book.ID]
		if len(numbers) == 0 {
			continue
		}
		slices.Sort(numbers)
		numbers = slices.Compact(numbers)
		book.Chapters = numbers[len(numbers)-1]
		if len(numbers) != book.Chapters {
			book.ChapterNumbers = numbers
		}
		out = append(out, book)
	}
	return out, nil
}

var sourceLabel = regexp.MustCompile(`^([1-9][0-9]{0,2})([a-z]?)(?:-([1-9][0-9]{0,2}))?$`)

func LabelRange(label string) (int, int, bool) {
	m := sourceLabel.FindStringSubmatch(label)
	if m == nil {
		return 0, 0, false
	}
	first, _ := strconv.Atoi(m[1])
	last := first
	if m[3] != "" {
		last, _ = strconv.Atoi(m[3])
		if m[2] != "" || last < first {
			return 0, 0, false
		}
	}
	return first, last, true
}
