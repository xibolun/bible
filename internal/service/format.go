package service

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/xibolun/bible/internal/bible"
)

var referenceStyles = []string{"full-version", "short-version", "full", "short", "inline", "verses-short", "verses-full"}

func (o CopyOptions) normalized() (CopyOptions, error) {
	if o.ChapterNumerals == "" {
		o.ChapterNumerals = "arabic"
	}
	if o.ReferenceBrackets == "" {
		o.ReferenceBrackets = "none"
	}
	if !slices.Contains([]string{"arabic", "chinese"}, o.ChapterNumerals) || !slices.Contains([]string{"none", "book", "corner", "square"}, o.ReferenceBrackets) {
		return o, errors.New("INVALID_SETTINGS")
	}
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

func chineseChapter(value int) string {
	digits := []rune("零一二三四五六七八九")
	if value < 10 {
		return string(digits[value])
	}
	if value < 20 {
		if value == 10 {
			return "十"
		}
		return "十" + string(digits[value%10])
	}
	if value < 100 {
		result := string(digits[value/10]) + "十"
		if value%10 != 0 {
			result += string(digits[value%10])
		}
		return result
	}
	result := string(digits[value/100]) + "百"
	if rest := value % 100; rest != 0 {
		if rest < 10 {
			result += "零"
		} else if rest < 20 {
			result += "一"
		}
		result += chineseChapter(rest)
	}
	return result
}

// formatPassage keeps source verse labels separate from selected text offsets.
func formatPassage(book bible.Book, chapter int, verses []bible.Verse, translation bible.Translation, options CopyOptions) CardLine {
	chapterText := strconv.Itoa(chapter)
	chapterSeparator := ":"
	if options.ChapterNumerals == "chinese" {
		chapterText = chineseChapter(chapter)
		chapterSeparator = ""
	}
	wrap := func(reference string) string {
		switch options.ReferenceBrackets {
		case "book":
			return "【" + reference + "】"
		case "corner":
			return "「" + reference + "」"
		case "square":
			return "[" + reference + "]"
		default:
			return reference
		}
	}
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
	ref := func(label string) string {
		return fmt.Sprintf("%s%s%s%s%s", name, space, chapterText, chapterSeparator, label)
	}
	parts := make([]string, 0, len(verses))
	for _, verse := range verses {
		text := verse.Text
		if strings.HasPrefix(options.ReferenceStyle, "verses-") {
			text = wrap(ref(verse.Label)) + ": " + text
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
		line.Text = wrap(reference) + ": " + line.Text
		return line
	}
	if strings.HasSuffix(options.ReferenceStyle, "-version") {
		reference += "·" + translation.Abbreviation
	}
	reference = wrap(reference)
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

func passage(data *bible.Dataset, sel Selection, id string, full bool, options CopyOptions) CardLine {
	book, _ := data.Book(sel.BookID)
	translation, _ := data.Translation(id)
	verses := make([]bible.Verse, 0, len(sel.Spans))
	for _, span := range sel.Spans {
		verse, present := data.Verse(id, sel.BookID, sel.Chapter, span.VerseKey)
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
