package bible

import (
	"bytes"
	"compress/gzip"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"strconv"
)

//go:embed dataset.json.gz
var bundled embed.FS

type Translation struct {
	ID            string `json:"id"`
	Language      string `json:"language"`
	Name          string `json:"name"`
	Abbreviation  string `json:"abbreviation"`
	DataVersion   string `json:"dataVersion"`
	SourceURL     string `json:"sourceUrl"`
	License       string `json:"license"`
	Origin        string `json:"origin,omitempty"`
	SourceFormat  string `json:"sourceFormat,omitempty"`
	SourceEdition string `json:"sourceEdition,omitempty"`
	Versification string `json:"versification,omitempty"`
	Comparable    bool   `json:"comparable,omitempty"`
}

type Book struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Abbreviation   string `json:"abbreviation"`
	EnglishName    string `json:"englishName"`
	Testament      string `json:"testament"`
	Chapters       int    `json:"chapters"`
	ChapterNumbers []int  `json:"chapterNumbers,omitempty"`
}

type Verse struct {
	Label string `json:"label"`
	Text  string `json:"text"`
}

type Dataset struct {
	Books        []Book             `json:"books"`
	Translations []Translation      `json:"translations"`
	Chapters     map[string][]Verse `json:"chapters"`
	Provider     EditionProvider    `json:"-"`
}

type Cell struct {
	TranslationID string `json:"translationId"`
	VerseKey      string `json:"verseKey"`
	Text          string `json:"text"`
	Missing       bool   `json:"missing"`
}

type Row struct {
	Label string `json:"label"`
	Cells []Cell `json:"cells"`
}

type Chapter struct {
	Book            Book   `json:"book"`
	Chapter         int    `json:"chapter"`
	Rows            []Row  `json:"rows"`
	ClientRequestID string `json:"clientRequestId"`
}

func Load() (*Dataset, error) {
	b, err := bundled.ReadFile("dataset.json.gz")
	if err != nil {
		return nil, err
	}
	r, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	d := new(Dataset)
	err = json.NewDecoder(io.LimitReader(r, 40<<20)).Decode(d)
	if err != nil {
		return nil, err
	}
	if len(d.Books) != 66 || len(d.Translations) < 1 {
		return nil, fmt.Errorf("invalid bundled canon")
	}
	return d, nil
}

func (d *Dataset) Translation(id string) (Translation, bool) {
	for _, t := range d.AllTranslations() {
		if t.ID == id {
			return t, true
		}
	}
	return Translation{}, false
}

func (d *Dataset) Book(id string) (Book, bool) {
	for _, b := range d.Books {
		if b.ID == id {
			return b, true
		}
	}
	return Book{}, false
}

func ChapterKey(translation, book string, chapter int) string {
	return translation + "/" + book + "/" + strconv.Itoa(chapter)
}

func (d *Dataset) Verse(translation, book string, chapter int, label string) (Verse, bool) {
	verses, err := d.ChapterVerses(translation, book, chapter)
	if err != nil {
		return Verse{}, false
	}
	for _, v := range verses {
		if v.Label == label {
			return v, true
		}
	}
	return Verse{}, false
}

// Align keeps source verse labels. Missing verses remain holes, never positional matches.
func (d *Dataset) Align(ids []string, book string, chapter int) (Chapter, error) {
	d = d.Snapshot()
	b, ok := d.Book(book)
	if !ok || chapter < 1 || chapter > 999 {
		return Chapter{}, fmt.Errorf("INVALID_REFERENCE")
	}
	if len(ids) < 1 || len(ids) > len(d.AllTranslations()) {
		return Chapter{}, fmt.Errorf("INVALID_TRANSLATION")
	}
	labels := []string{}
	all := map[string]bool{}
	seen := map[string]bool{}
	contents := map[string]map[string]Verse{}
	for _, id := range ids {
		if seen[id] {
			return Chapter{}, fmt.Errorf("INVALID_TRANSLATION")
		}
		seen[id] = true
		t, ok := d.Translation(id)
		if !ok {
			return Chapter{}, fmt.Errorf("INVALID_TRANSLATION")
		}
		if len(ids) > 1 && t.Origin == "user" && !t.Comparable {
			return Chapter{}, fmt.Errorf("VERSIFICATION_UNSUPPORTED")
		}
		verses, err := d.ChapterVerses(id, book, chapter)
		if err != nil {
			return Chapter{}, err
		}
		contents[id] = map[string]Verse{}
		for _, v := range verses {
			contents[id][v.Label] = v
			if !all[v.Label] {
				labels = append(labels, v.Label)
				all[v.Label] = true
			}
		}
	}
	if len(labels) == 0 {
		for _, id := range ids {
			if t, _ := d.Translation(id); t.Origin == "user" {
				return Chapter{}, fmt.Errorf("INVALID_REFERENCE")
			}
		}
		if chapter > b.Chapters {
			return Chapter{}, fmt.Errorf("INVALID_REFERENCE")
		}
		return Chapter{}, fmt.Errorf("DATA_UNAVAILABLE")
	}
	slices.SortFunc(labels, func(a, b string) int {
		number := func(s string) int {
			i := 0
			for i < len(s) && s[i] >= '0' && s[i] <= '9' {
				i++
			}
			n, _ := strconv.Atoi(s[:i])
			return n
		}
		ai, bi := number(a), number(b)
		if ai != bi {
			return ai - bi
		}
		if a < b {
			return -1
		}
		if a > b {
			return 1
		}
		return 0
	})
	out := Chapter{Book: b, Chapter: chapter, Rows: []Row{}}
	for _, label := range labels {
		row := Row{Label: label, Cells: []Cell{}}
		for _, id := range ids {
			v, ok := contents[id][label]
			row.Cells = append(row.Cells, Cell{TranslationID: id, VerseKey: label, Text: v.Text, Missing: !ok || v.Text == ""})
		}
		out.Rows = append(out.Rows, row)
	}
	return out, nil
}
