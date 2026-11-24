package bible

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

type SearchHit struct {
	TranslationID string `json:"translationId"`
	BookID        string `json:"bookId"`
	BookName      string `json:"bookName"`
	EnglishName   string `json:"englishName"`
	Chapter       int    `json:"chapter"`
	VerseKey      string `json:"verseKey"`
	Text          string `json:"text"`
}
type SearchPage struct {
	Total   int         `json:"total"`
	Results []SearchHit `json:"results"`
}
type likeToken struct {
	char rune
	kind byte
}

func ValidateSearchPattern(pattern string) error {
	_, err := likePattern(pattern)
	return err
}

// Contains matching adds implicit '%' at both ends; '_' consumes one rune.
// This matcher avoids SQL execution and regex backtracking.
func likePattern(pattern string) ([]likeToken, error) {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" || utf8.RuneCountInString(pattern) > 128 {
		return nil, fmt.Errorf("INVALID_SEARCH")
	}
	tokens := []likeToken{{kind: '%'}}
	escape := false
	for _, ch := range pattern {
		if escape {
			tokens = append(tokens, likeToken{char: asciiLower(ch)})
			escape = false
			continue
		}
		if ch == '\\' {
			escape = true
			continue
		}
		if ch == '%' || ch == '_' {
			if ch != '%' || tokens[len(tokens)-1].kind != '%' {
				tokens = append(tokens, likeToken{kind: byte(ch)})
			}
		} else {
			tokens = append(tokens, likeToken{char: asciiLower(ch)})
		}
	}
	if escape {
		return nil, fmt.Errorf("INVALID_SEARCH")
	}
	if tokens[len(tokens)-1].kind != '%' {
		tokens = append(tokens, likeToken{kind: '%'})
	}
	return tokens, nil
}
func asciiLower(ch rune) rune {
	if ch >= 'A' && ch <= 'Z' {
		return ch + 32
	}
	return ch
}
func likeMatch(text string, pattern []likeToken) bool {
	chars := []rune(text)
	i, j, star, retry := 0, 0, -1, 0
	for i < len(chars) {
		if j < len(pattern) && (pattern[j].kind == '_' || pattern[j].kind == 0 && pattern[j].char == asciiLower(chars[i])) {
			i++
			j++
			continue
		}
		if j < len(pattern) && pattern[j].kind == '%' {
			star = j
			j++
			retry = i
			continue
		}
		if star >= 0 {
			retry++
			i = retry
			j = star + 1
			continue
		}
		return false
	}
	for j < len(pattern) && pattern[j].kind == '%' {
		j++
	}
	return j == len(pattern)
}
func (d *Dataset) Search(translation, pattern string, offset, limit int) (SearchPage, error) {
	d = d.Snapshot()
	if _, ok := d.Translation(translation); !ok {
		return SearchPage{}, fmt.Errorf("INVALID_TRANSLATION")
	}
	if offset < 0 || offset > 100000 || limit < 1 || limit > 100 {
		return SearchPage{}, fmt.Errorf("INVALID_SEARCH")
	}
	compiled, err := likePattern(pattern)
	if err != nil {
		return SearchPage{}, err
	}
	page := SearchPage{Results: []SearchHit{}}
	if t, _ := d.Translation(translation); t.Origin == "user" {
		err := d.Provider.Walk(translation, func(bookID string, chapter int, verse Verse) {
			if !likeMatch(verse.Text, compiled) {
				return
			}
			book, _ := d.Book(bookID)
			if page.Total >= offset && len(page.Results) < limit {
				page.Results = append(page.Results, SearchHit{translation, bookID, book.Name, book.EnglishName, chapter, verse.Label, verse.Text})
			}
			page.Total++
		})
		return page, err
	}
	for _, book := range d.Books {
		for chapter := 1; chapter <= book.Chapters; chapter++ {
			for _, verse := range d.Chapters[ChapterKey(translation, book.ID, chapter)] {
				if !likeMatch(verse.Text, compiled) {
					continue
				}
				if page.Total >= offset && len(page.Results) < limit {
					page.Results = append(page.Results, SearchHit{translation, book.ID, book.Name, book.EnglishName, chapter, verse.Label, verse.Text})
				}
				page.Total++
			}
		}
	}
	return page, nil
}
