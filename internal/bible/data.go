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
	ID           string `json:"id"`
	Language     string `json:"language"`
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
	DataVersion  string `json:"dataVersion"`
	SourceURL    string `json:"sourceUrl"`
	License      string `json:"license"`
}

type Book struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Abbreviation string `json:"abbreviation"`
	EnglishName  string `json:"englishName"`
	Testament    string `json:"testament"`
	Chapters     int    `json:"chapters"`
}

type Verse struct {
	Label string `json:"label"`
	Text  string `json:"text"`
}

type Dataset struct {
	Books        []Book             `json:"books"`
	Translations []Translation      `json:"translations"`
	Chapters     map[string][]Verse `json:"chapters"`
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
	if len(d.Books) != 66 || len(d.Translations) < 2 {
		return nil, fmt.Errorf("invalid bundled canon")
	}
	return d, nil
}

func (d *Dataset) Translation(id string) (Translation, bool) {
	for _, t := range d.Translations {
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
	for _, v := range d.Chapters[ChapterKey(translation, book, chapter)] {
		if v.Label == label {
			return v, true
		}
	}
	return Verse{}, false
}

// Align keeps source verse labels. Missing verses remain holes, never positional matches.
func (d *Dataset) Align(ids []string, book string, chapter int) (Chapter, error) {
	b, ok := d.Book(book)
	if !ok || chapter < 1 || chapter > b.Chapters {
		return Chapter{}, fmt.Errorf("INVALID_REFERENCE")
	}
	if len(ids) < 1 || len(ids) > 2 || (len(ids) == 2 && ids[0] == ids[1]) {
		return Chapter{}, fmt.Errorf("INVALID_TRANSLATION")
	}
	labels := []string{}
	all := map[string]bool{}
	for _, id := range ids {
		if _, ok := d.Translation(id); !ok {
			return Chapter{}, fmt.Errorf("INVALID_TRANSLATION")
		}
		verses, found := d.Chapters[ChapterKey(id, book, chapter)]
		if !found {
			return Chapter{}, fmt.Errorf("DATA_UNAVAILABLE")
		}
		for _, v := range verses {
			if !all[v.Label] {
				labels = append(labels, v.Label)
				all[v.Label] = true
			}
		}
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
			v, ok := d.Verse(id, book, chapter, label)
			row.Cells = append(row.Cells, Cell{TranslationID: id, VerseKey: label, Text: v.Text, Missing: !ok})
		}
		out.Rows = append(out.Rows, row)
	}
	return out, nil
}
