package service

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/xibolun/bible/internal/bible"
)

var referenceStyles = []string{"full-version", "short-version", "full", "short", "inline", "verses-short", "verses-full"}

func (o CopyOptions) normalized() (CopyOptions, error) {
	if o.ReferencePosition == "" {
		o.ReferencePosition = "after"
	}
	if o.UILanguage == "" {
		o.UILanguage = "zh-CN"
	}
	if o.ReferenceStyle == "" {
		o.ReferenceStyle = "full-version"
	}
	if !slices.Contains(referenceStyles, o.ReferenceStyle) || !slices.Contains([]string{"before", "after"}, o.ReferencePosition) || !slices.Contains([]string{"zh-CN", "en"}, o.UILanguage) {
		return o, errors.New("INVALID_SETTINGS")
	}
	return o, nil
}

// formatPassage keeps source verse labels separate from selected text offsets.
func formatPassage(book bible.Book, chapter int, verses []bible.Verse, translation bible.Translation, options CopyOptions) CardLine {
	short := slices.Contains([]string{"short-version", "short", "inline", "verses-short"}, options.ReferenceStyle)
	name, space := book.Name, ""
	if short {
		name = book.Abbreviation
	}
	if options.UILanguage == "en" {
		name, space = book.EnglishName, " "
		if short {
			name = book.ID
		}
	}
	ref := func(label string) string { return fmt.Sprintf("%s%s%d:%s", name, space, chapter, label) }
	parts := make([]string, 0, len(verses))
	for _, verse := range verses {
		text := verse.Text
		if strings.HasPrefix(options.ReferenceStyle, "verses-") {
			text = ref(verse.Label) + ": " + text
		}
		parts = append(parts, text)
	}
	line := CardLine{Text: strings.Join(parts, "\n"), TranslationID: translation.ID, Version: translation.Abbreviation}
	if strings.HasPrefix(options.ReferenceStyle, "verses-") {
		return line
	}
	label := verses[0].Label
	if last := verses[len(verses)-1].Label; last != label {
		separator := "–"
		if options.ReferenceStyle == "inline" {
			separator = "-"
		}
		label += separator + last
	}
	reference := ref(label)
	if options.ReferenceStyle == "inline" {
		line.Text = reference + ": " + line.Text
		return line
	}
	if strings.HasSuffix(options.ReferenceStyle, "-version") {
		reference += "·" + translation.Abbreviation
	}
	line.ReferenceBefore = options.ReferencePosition == "before"
	if !line.ReferenceBefore {
		reference = "— " + reference
	}
	line.Reference = reference
	return line
}

func passageText(line CardLine) string {
	if line.Reference == "" {
		return line.Text
	}
	if line.ReferenceBefore {
		return line.Reference + "\n" + line.Text
	}
	return line.Text + "\n" + line.Reference
}

func (s *Service) passage(sel Selection, id string, full bool, options CopyOptions) CardLine {
	book, _ := s.Data.Book(sel.BookID)
	translation, _ := s.Data.Translation(id)
	verses := make([]bible.Verse, 0, len(sel.Spans))
	for _, span := range sel.Spans {
		verse, present := s.Data.Verse(id, sel.BookID, sel.Chapter, span.VerseKey)
		if !present {
			verse = bible.Verse{Label: span.VerseKey, Text: "本译本无此节"}
			if options.UILanguage == "en" {
				verse.Text = "Verse not present in this translation"
			}
		} else if !full {
			verse.Text = string([]rune(verse.Text)[span.Start:span.End])
		}
		verses = append(verses, verse)
	}
	return formatPassage(book, sel.Chapter, verses, translation, options)
}
