package bible

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

type Passage struct {
	Book        Book        `json:"book"`
	Chapter     int         `json:"chapter"`
	Verses      []Verse     `json:"verses"`
	Translation Translation `json:"translation"`
}

func normalizeReference(s string) string {
	return strings.ToLower(strings.Map(func(r rune) rune {
		if r >= '！' && r <= '～' {
			r -= 0xfee0
		}
		if unicode.IsSpace(r) {
			return -1
		}
		if r == '–' || r == '—' {
			return '-'
		}
		return r
	}, s))
}

var chapterReference = regexp.MustCompile(`^([1-9][0-9]{0,2})(?::([1-9][0-9]{0,2})(?:-([1-9][0-9]{0,2}))?)?$`)

// ResolveReference matches aliases before parsing numbers (including numbered books).
// Ranges require every source label; missing verses are never ordinal substitutes.
func (d *Dataset) ResolveReference(reference, translationID string) (Passage, error) {
	bad := func() (Passage, error) { return Passage{}, fmt.Errorf("INVALID_REFERENCE") }
	if len(reference) > 256 {
		return bad()
	}
	t, ok := d.Translation(translationID)
	if !ok {
		return Passage{}, fmt.Errorf("INVALID_TRANSLATION")
	}
	input := normalizeReference(reference)
	var book Book
	var suffix string
	longest := 0
	for _, b := range d.Books {
		numericName := strings.NewReplacer("III ", "3 ", "II ", "2 ", "I ", "1 ").Replace(b.EnglishName)
		for _, name := range []string{b.ID, b.Name, b.Abbreviation, b.EnglishName, numericName} {
			alias := normalizeReference(name)
			if len(alias) > longest && strings.HasPrefix(input, alias) {
				book, suffix, longest = b, input[len(alias):], len(alias)
			}
		}
	}
	match := chapterReference.FindStringSubmatch(suffix)
	if longest == 0 || match == nil {
		return bad()
	}
	ch, _ := strconv.Atoi(match[1])
	if ch > book.Chapters {
		return bad()
	}
	verses := d.Chapters[ChapterKey(t.ID, book.ID, ch)]
	if len(verses) == 0 {
		return bad()
	}
	if match[2] != "" {
		first, _ := strconv.Atoi(match[2])
		last := first
		if match[3] != "" {
			last, _ = strconv.Atoi(match[3])
		}
		if last < first {
			return bad()
		}
		selected := []Verse{}
		for n := first; n <= last; n++ {
			v, found := d.Verse(t.ID, book.ID, ch, strconv.Itoa(n))
			if !found {
				return bad()
			}
			selected = append(selected, v)
		}
		verses = selected
	}
	return Passage{book, ch, verses, t}, nil
}
