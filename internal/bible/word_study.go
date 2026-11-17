package bible

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

//go:embed word-study.json.gz
var studyBundle []byte

//go:embed chinese-dictionary.json.gz
var chineseBundle []byte

type DictionaryEntry struct {
	ID                string `json:"id"`
	Lemma             string `json:"lemma"`
	Language          string `json:"language"`
	Transliteration   string `json:"transliteration"`
	Pronunciation     string `json:"pronunciation"`
	Definition        string `json:"definition"`
	Source            string `json:"source"`
	ChineseDefinition string `json:"chineseDefinition"`
	ChineseSource     string `json:"chineseSource"`
}

type ChineseEntry struct {
	Definition string `json:"definition"`
	Lemma      string `json:"lemma"`
	Source     string `json:"source"`
}

type OriginalWord struct {
	Text    string   `json:"text"`
	Strongs []string `json:"strongs"`
}

type VerseStudy struct {
	Words   []OriginalWord    `json:"words"`
	Entries []DictionaryEntry `json:"entries"`
}

type WordStudy struct {
	Entries map[string]DictionaryEntry `json:"entries"`
	Verses  map[string][]OriginalWord  `json:"verses"`
	Chinese map[string]ChineseEntry    `json:"-"`
}

var studyOnce = sync.OnceValues(func() (*WordStudy, error) {
	r, err := gzip.NewReader(bytes.NewReader(studyBundle))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	var data WordStudy
	if err := json.NewDecoder(io.LimitReader(r, 64<<20)).Decode(&data); err != nil {
		return nil, err
	}
	if len(data.Entries) < 14000 || len(data.Verses) != 31102 {
		return nil, fmt.Errorf("DATA_UNAVAILABLE")
	}
	chinese, err := gzip.NewReader(bytes.NewReader(chineseBundle))
	if err != nil {
		return nil, err
	}
	defer chinese.Close()
	if err := json.NewDecoder(io.LimitReader(chinese, 48<<20)).Decode(&data.Chinese); err != nil {
		return nil, err
	}
	if len(data.Chinese) < 14000 {
		return nil, fmt.Errorf("DATA_UNAVAILABLE")
	}
	return &data, nil
})

func dictionaryEntry(data *WordStudy, code string) (DictionaryEntry, bool) {
	entry, ok := data.Entries[code]
	if chinese, found := data.Chinese[code]; found {
		if !ok {
			language := "Hebrew"
			if strings.HasPrefix(code, "G") {
				language = "Greek"
			}
			entry = DictionaryEntry{ID: code, Lemma: chinese.Lemma, Language: language}
		}
		entry.ChineseDefinition = chinese.Definition
		entry.ChineseSource = chinese.Source
		ok = true
	}
	return entry, ok
}

var strongCode = regexp.MustCompile(`^[HG][0-9]{1,5}$`)

func LookupWord(code string) (DictionaryEntry, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if !strongCode.MatchString(code) {
		return DictionaryEntry{}, fmt.Errorf("INVALID_WORD")
	}
	number, _ := strconv.Atoi(code[1:])
	code = code[:1] + strconv.Itoa(number)
	data, err := studyOnce()
	if err != nil {
		return DictionaryEntry{}, fmt.Errorf("DATA_UNAVAILABLE")
	}
	entry, ok := dictionaryEntry(data, code)
	if !ok {
		return DictionaryEntry{}, fmt.Errorf("WORD_NOT_FOUND")
	}
	return entry, nil
}

func (d *Dataset) VerseWords(book string, chapter int, verse string) (VerseStudy, error) {
	b, ok := d.Book(book)
	if !ok || chapter < 1 || chapter > b.Chapters {
		return VerseStudy{}, fmt.Errorf("INVALID_REFERENCE")
	}
	if _, ok := d.Verse("kjv", book, chapter, verse); !ok {
		return VerseStudy{}, fmt.Errorf("INVALID_REFERENCE")
	}
	data, err := studyOnce()
	if err != nil {
		return VerseStudy{}, fmt.Errorf("DATA_UNAVAILABLE")
	}
	words, ok := data.Verses[book+"/"+strconv.Itoa(chapter)+"/"+verse]
	if !ok {
		return VerseStudy{}, fmt.Errorf("DATA_UNAVAILABLE")
	}
	out := VerseStudy{Words: words, Entries: []DictionaryEntry{}}
	seen := map[string]bool{}
	for _, word := range words {
		for _, code := range word.Strongs {
			if entry, ok := dictionaryEntry(data, code); ok && !seen[code] {
				out.Entries = append(out.Entries, entry)
				seen[code] = true
			}
		}
	}
	return out, nil
}
