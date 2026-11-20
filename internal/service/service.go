package service

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"image/png"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/rivo/uniseg"
	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/storage"
)

type Problem struct {
	Code        string `json:"code"`
	Message     string `json:"message"`
	Retryable   bool   `json:"retryable"`
	OperationID string `json:"operationId"`
}
type Result[T any] struct {
	OK    bool     `json:"ok"`
	Data  *T       `json:"data,omitempty"`
	Error *Problem `json:"error,omitempty"`
}

func success[T any](v T) Result[T] { return Result[T]{OK: true, Data: &v} }
func failure[T any](code string) Result[T] {
	if code == "PROJECTION_LIMIT" {
		return Result[T]{Error: &Problem{Code: code, Message: "投影最多12段、600节经文，请减少清单后重试", OperationID: rand.Text()}}
	}
	msg := map[string]string{"INVALID_REFERENCE": "书卷或章节不存在", "INVALID_TRANSLATION": "请选择不同且已安装的译本", "DATA_UNAVAILABLE": "内置经文不可用，请重新安装完整应用", "INVALID_SELECTION": "请选择同章同译本的连续经文", "STALE_DATA": "经文版本已变化，请重新选择", "STORAGE_ERROR": "无法读取或保存本地数据，请检查磁盘权限后重试", "CLIPBOARD_ERROR": "复制失败，请保留选区后重试", "INVALID_IMAGE": "卡片图像或尺寸无效", "EXPORT_ERROR": "保存失败，请检查目标文件夹和磁盘空间", "INVALID_SETTINGS": "显示设置或阅读位置无效", "CARD_LIMIT": "卡片最多20节、4000个字符", "BRIDGE_UNAVAILABLE": "桌面服务未连接，请重启应用"}[code]
	if code == "INVALID_SEARCH" {
		msg = "请输入 1–128 个字符的搜索条件，检查转义符和分页范围"
	}
	if msg == "" {
		msg = map[string]string{"INVALID_WORD": "请输入 Strong’s 编号，例如 H430 或 G3056", "WORD_NOT_FOUND": "内置词典没有此 Strong’s 词条"}[code]
		if msg == "" {
			msg = "操作未完成，请重试"
		}
	}
	return Result[T]{Error: &Problem{Code: code, Message: msg, Retryable: code == "STORAGE_ERROR" || code == "CLIPBOARD_ERROR" || code == "EXPORT_ERROR", OperationID: rand.Text()}}
}

type SearchHistoryEntry struct {
	TranslationID string `json:"translationId"`
	Pattern       string `json:"pattern"`
}
type Preferences struct {
	ProjectionStyle   ProjectionStyle      `json:"projectionStyle"`
	SearchHistory     []SearchHistoryEntry `json:"searchHistory"`
	ReadingTheme      string               `json:"readingTheme"`
	BookID            string               `json:"bookId"`
	Chapter           int                  `json:"chapter"`
	TopVerse          string               `json:"topVerse"`
	ScrollOffset      float64              `json:"scrollOffset"`
	Translations      []string             `json:"translations"`
	Parallel          bool                 `json:"parallel"`
	FontSize          int                  `json:"fontSize"`
	GlobalFontSize    int                  `json:"globalFontSize"`
	ChapterNumerals   string               `json:"chapterNumerals"`
	ReferenceBrackets string               `json:"referenceBrackets"`
	ReferencePosition string               `json:"referencePosition"`
	ReferenceStyle    string               `json:"referenceStyle"`
	UILanguage        string               `json:"uiLanguage"`
	WindowX           int                  `json:"windowX"`
	WindowY           int                  `json:"windowY"`
	WindowWidth       int                  `json:"windowWidth"`
	WindowHeight      int                  `json:"windowHeight"`
	Maximized         bool                 `json:"maximized"`
	SchemaVersion     int                  `json:"schemaVersion"`
}

func Defaults() Preferences {
	return Preferences{ProjectionStyle: DefaultProjectionStyle(), SearchHistory: []SearchHistoryEntry{}, ReadingTheme: "light", BookID: "GEN", Chapter: 1, Translations: []string{"cuv", "webp"}, FontSize: 18, GlobalFontSize: 13, ChapterNumerals: "arabic", ReferenceBrackets: "none", ReferencePosition: "after", ReferenceStyle: "full-version", UILanguage: "zh-CN", WindowWidth: 1280, WindowHeight: 800, SchemaVersion: 1}
}

type Desktop interface {
	Copy(string) error
	Quit() error
	Save([]byte, string) (string, error)
}
type smokeReporter interface{ FinishSmoke(bool, string) error }
type Service struct {
	Data       *bible.Dataset
	Store      *storage.Store
	Desktop    Desktop
	projection projectionStore
}

func New(data *bible.Dataset, store *storage.Store, desktop Desktop) *Service {
	return &Service{Data: data, Store: store, Desktop: desktop, projection: projectionStore{state: ProjectionState{Style: DefaultProjectionStyle()}}}
}

func (s *Service) ListTranslations() Result[[]bible.Translation] { return success(s.Data.Translations) }
func (s *Service) Quit() Result[bool] {
	if s.Desktop == nil || s.Desktop.Quit() != nil {
		return failure[bool]("BRIDGE_UNAVAILABLE")
	}
	return success(true)
}
func (s *Service) SearchScripture(translation, pattern string, offset, limit int) Result[bible.SearchPage] {
	page, err := s.Data.Search(translation, pattern, offset, limit)
	if err != nil {
		return failure[bible.SearchPage](err.Error())
	}
	return success(page)
}
func (s *Service) LookupWord(code string) Result[bible.DictionaryEntry] {
	entry, err := bible.LookupWord(code)
	if err != nil {
		return failure[bible.DictionaryEntry](err.Error())
	}
	return success(entry)
}
func (s *Service) GetVerseWords(book string, chapter int, verse string) Result[bible.VerseStudy] {
	study, err := s.Data.VerseWords(book, chapter, verse)
	if err != nil {
		return failure[bible.VerseStudy](err.Error())
	}
	return success(study)
}
func (s *Service) ListBooks(ids []string) Result[[]bible.Book] {
	if _, err := s.Data.Align(ids, "GEN", 1); err != nil {
		return failure[[]bible.Book](err.Error())
	}
	return success(s.Data.Books)
}
func (s *Service) GetChapter(ids []string, book string, chapter int, request string) Result[bible.Chapter] {
	c, err := s.Data.Align(ids, book, chapter)
	if err != nil {
		return failure[bible.Chapter](err.Error())
	}
	c.ClientRequestID = request
	return success(c)
}
func (s *Service) GetPreferences() Result[Preferences] {
	p := Defaults()
	if s.Store == nil || s.Store.Preferences(&p) != nil {
		return failure[Preferences]("STORAGE_ERROR")
	}
	p.ProjectionStyle = p.ProjectionStyle.normalizedTheme()
	if !s.validPreferences(p) {
		return failure[Preferences]("INVALID_SETTINGS")
	}
	if p.SearchHistory == nil {
		p.SearchHistory = []SearchHistoryEntry{}
	}
	return success(p)
}
func (s *Service) validPreferences(p Preferences) bool {
	if !p.ProjectionStyle.valid() {
		return false
	}
	if p.GlobalFontSize < 11 || p.GlobalFontSize > 20 || !slices.Contains([]string{"arabic", "chinese"}, p.ChapterNumerals) || !slices.Contains([]string{"none", "book", "corner", "square"}, p.ReferenceBrackets) {
		return false
	}
	if len(p.SearchHistory) > 20 {
		return false
	}
	for _, entry := range p.SearchHistory {
		if _, ok := s.Data.Translation(entry.TranslationID); !ok || bible.ValidateSearchPattern(entry.Pattern) != nil {
			return false
		}
	}
	if !slices.Contains([]string{"light", "paper", "sage", "night"}, p.ReadingTheme) {
		return false
	}
	_, err := s.Data.Align(p.Translations, p.BookID, p.Chapter)
	return err == nil && slices.Contains(referenceStyles, p.ReferenceStyle) && slices.Contains([]string{"before", "after"}, p.ReferencePosition) && slices.Contains([]string{"zh-CN", "en"}, p.UILanguage) && p.FontSize >= 14 && p.FontSize <= 32 && p.WindowWidth >= 1024 && p.WindowWidth <= 16384 && p.WindowHeight >= 640 && p.WindowHeight <= 16384 && p.ScrollOffset >= 0 && p.ScrollOffset < 100000 && p.SchemaVersion == 1
}
func (s *Service) SavePreferences(p Preferences) Result[bool] {
	p.ProjectionStyle = p.ProjectionStyle.normalizedTheme()
	if !s.validPreferences(p) {
		return failure[bool]("INVALID_SETTINGS")
	}
	if s.Store == nil || s.Store.SavePreferences(p) != nil {
		return failure[bool]("STORAGE_ERROR")
	}
	return success(true)
}
func (s *Service) ListHighlights(ids []string, book string, chapter int) Result[[]storage.Highlight] {
	if _, e := s.Data.Align(ids, book, chapter); e != nil {
		return failure[[]storage.Highlight](e.Error())
	}
	if s.Store == nil {
		return failure[[]storage.Highlight]("STORAGE_ERROR")
	}
	hs, err := s.Store.Highlights(book, chapter)
	if err != nil {
		return failure[[]storage.Highlight]("STORAGE_ERROR")
	}
	out := []storage.Highlight{}
	for _, h := range hs {
		if slices.Contains(ids, h.TranslationID) {
			out = append(out, h)
		}
	}
	return success(out)
}

type Span struct {
	VerseKey string `json:"verseKey"`
	Start    int    `json:"start"`
	End      int    `json:"end"`
}
type Selection struct {
	TranslationID string `json:"translationId"`
	DataVersion   string `json:"dataVersion"`
	BookID        string `json:"bookId"`
	Chapter       int    `json:"chapter"`
	Spans         []Span `json:"spans"`
}

func boundaries(text string) map[int]bool {
	b := map[int]bool{0: true}
	g := uniseg.NewGraphemes(text)
	n := 0
	for g.Next() {
		n += utf8.RuneCountInString(g.Str())
		b[n] = true
	}
	return b
}
func (s *Service) validate(sel Selection) ([]storage.Highlight, error) {
	t, ok := s.Data.Translation(sel.TranslationID)
	if !ok {
		return nil, errors.New("INVALID_TRANSLATION")
	}
	if sel.DataVersion != t.DataVersion {
		return nil, errors.New("STALE_DATA")
	}
	if _, e := s.Data.Align([]string{sel.TranslationID}, sel.BookID, sel.Chapter); e != nil {
		return nil, e
	}
	if len(sel.Spans) == 0 || len(sel.Spans) > 200 {
		return nil, errors.New("INVALID_SELECTION")
	}
	verses := s.Data.Chapters[bible.ChapterKey(sel.TranslationID, sel.BookID, sel.Chapter)]
	out := []storage.Highlight{}
	previous := -1
	for i, p := range sel.Spans {
		index := slices.IndexFunc(verses, func(v bible.Verse) bool { return v.Label == p.VerseKey })
		if index < 0 || (i > 0 && index != previous+1) {
			return nil, errors.New("INVALID_SELECTION")
		}
		v := verses[index]
		n := utf8.RuneCountInString(v.Text)
		bs := boundaries(v.Text)
		if p.Start < 0 || p.End > n || p.Start >= p.End || !bs[p.Start] || !bs[p.End] {
			return nil, errors.New("INVALID_SELECTION")
		}
		if i > 0 && p.Start != 0 {
			return nil, errors.New("INVALID_SELECTION")
		}
		if i < len(sel.Spans)-1 && p.End != n {
			return nil, errors.New("INVALID_SELECTION")
		}
		out = append(out, storage.Highlight{TranslationID: t.ID, DataVersion: t.DataVersion, BookID: sel.BookID, Chapter: sel.Chapter, VerseKey: p.VerseKey, Start: p.Start, End: p.End})
		previous = index
	}
	return out, nil
}

func (s *Service) ApplyHighlight(request string, sel Selection, color string) Result[[]storage.Highlight] {
	if len(request) < 8 || len(request) > 100 || !slices.Contains([]string{"", "yellow", "green", "blue", "pink", "purple"}, color) {
		return failure[[]storage.Highlight]("INVALID_SELECTION")
	}
	spans, e := s.validate(sel)
	if e != nil {
		return failure[[]storage.Highlight](e.Error())
	}
	if s.Store == nil || s.Store.Paint(request, spans, color) != nil {
		return failure[[]storage.Highlight]("STORAGE_ERROR")
	}
	return s.ListHighlights([]string{sel.TranslationID}, sel.BookID, sel.Chapter)
}

type CopyOptions struct {
	ChapterNumerals   string `json:"chapterNumerals"`
	ReferenceBrackets string `json:"referenceBrackets"`
	ReferenceStyle    string `json:"referenceStyle"`
	ReferencePosition string `json:"referencePosition"`
	UILanguage        string `json:"uiLanguage"`
}

func (s *Service) CopySelection(sel Selection, mode string, ids []string, options CopyOptions) Result[bool] {
	options, err := options.normalized()
	if err != nil {
		return failure[bool](err.Error())
	}
	if _, err = s.validate(sel); err != nil {
		return failure[bool](err.Error())
	}
	full := false
	switch mode {
	case "textWithReference":
		ids = []string{sel.TranslationID}
	case "parallelVerse":
		if len(ids) < 2 || !slices.Contains(ids, sel.TranslationID) {
			return failure[bool]("INVALID_SELECTION")
		}
		if _, err = s.Data.Align(ids, sel.BookID, sel.Chapter); err != nil {
			return failure[bool](err.Error())
		}
		full = true
	default:
		return failure[bool]("INVALID_SELECTION")
	}
	blocks := make([]string, 0, len(ids))
	for _, id := range ids {
		blocks = append(blocks, passageText(s.passage(sel, id, full, options)))
	}
	if s.Desktop == nil || s.Desktop.Copy(strings.Join(blocks, "\n\n")) != nil {
		return failure[bool]("CLIPBOARD_ERROR")
	}
	return success(true)
}

type CardLine struct {
	ReferenceBefore bool   `json:"referenceBefore"`
	Text            string `json:"text"`
	Reference       string `json:"reference"`
	TranslationID   string `json:"translationId"`
	Version         string `json:"version"`
}
type CardContent struct {
	Lines      []CardLine `json:"lines"`
	FileName   string     `json:"fileName"`
	Codepoints int        `json:"codepoints"`
}

func (s *Service) GetCard(sel Selection, ids []string, full bool, options CopyOptions) Result[CardContent] {
	options, err := options.normalized()
	if err != nil {
		return failure[CardContent](err.Error())
	}
	if _, err = s.validate(sel); err != nil {
		return failure[CardContent](err.Error())
	}
	if len(sel.Spans) > 20 {
		return failure[CardContent]("CARD_LIMIT")
	}
	if _, err = s.Data.Align(ids, sel.BookID, sel.Chapter); err != nil {
		return failure[CardContent](err.Error())
	}
	if !full && (len(ids) != 1 || ids[0] != sel.TranslationID) {
		return failure[CardContent]("INVALID_SELECTION")
	}
	out := CardContent{Lines: []CardLine{}, FileName: fmt.Sprintf("bible-%s-%d-%s", sel.BookID, sel.Chapter, sel.Spans[0].VerseKey)}
	for _, id := range ids {
		line := s.passage(sel, id, full, options)
		out.Lines = append(out.Lines, line)
		out.Codepoints += utf8.RuneCountInString(line.Text) + utf8.RuneCountInString(line.Reference)
	}
	if out.Codepoints == 0 || out.Codepoints > 4000 {
		return failure[CardContent]("CARD_LIMIT")
	}
	return success(out)
}

type Saved struct {
	Saved     bool   `json:"saved"`
	Cancelled bool   `json:"cancelled"`
	FileName  string `json:"fileName"`
}

var safeName = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

func (s *Service) SaveCard(encoded string, width, height int, name string, sel Selection) Result[Saved] {
	if _, e := s.validate(sel); e != nil {
		return failure[Saved](e.Error())
	}
	if width != 1080 || (height != 1080 && height != 1920) || len(encoded) > 24<<20 {
		return failure[Saved]("INVALID_IMAGE")
	}
	b, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil || len(b) > 16<<20 {
		return failure[Saved]("INVALID_IMAGE")
	}
	c, e := png.DecodeConfig(bytes.NewReader(b))
	if e != nil || c.Width != width || c.Height != height {
		return failure[Saved]("INVALID_IMAGE")
	}
	if _, e = png.Decode(bytes.NewReader(b)); e != nil {
		return failure[Saved]("INVALID_IMAGE")
	}
	if s.Desktop == nil {
		return failure[Saved]("EXPORT_ERROR")
	}
	name = safeName.ReplaceAllString(name, "-")
	if len(name) > 100 {
		name = name[:100]
	}
	if name == "" {
		name = "bible-card"
	}
	path, e := s.Desktop.Save(b, name+".png")
	if e != nil {
		return failure[Saved]("EXPORT_ERROR")
	}
	if path == "" {
		return success(Saved{Cancelled: true})
	}
	return success(Saved{Saved: true, FileName: filepath.Base(path)})
}

func (s *Service) ReportSmoke(passed bool, frontendVersion string) Result[bool] {
	r, ok := s.Desktop.(smokeReporter)
	if !ok || r.FinishSmoke(passed, frontendVersion) != nil {
		return failure[bool]("EXPORT_ERROR")
	}
	return success(true)
}
