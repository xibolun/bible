package service

import (
	"regexp"
	"slices"
	"sync"

	"github.com/xibolun/bible/internal/bible"
)

type ProjectionStyle struct {
	FontSize          int    `json:"fontSize"`
	BackgroundColor   string `json:"backgroundColor"`
	TextColor         string `json:"textColor"`
	Alignment         string `json:"alignment"`
	VersesPerPage     int    `json:"versesPerPage"`
	ReferencePosition string `json:"referencePosition"`
	ReferenceStyle    string `json:"referenceStyle"`
	ChapterNumerals   string `json:"chapterNumerals"`
	ReferenceBrackets string `json:"referenceBrackets"`
	UILanguage        string `json:"uiLanguage"`
}

func DefaultProjectionStyle() ProjectionStyle {
	return ProjectionStyle{64, "#ffffff", "#18212b", "left", 2, "after", "short-version", "arabic", "none", "zh-CN"}
}

var projectionColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (p ProjectionStyle) valid() bool {
	return p.FontSize >= 24 && p.FontSize <= 120 && p.VersesPerPage >= 1 && p.VersesPerPage <= 6 &&
		projectionColor.MatchString(p.BackgroundColor) && projectionColor.MatchString(p.TextColor) &&
		slices.Contains([]string{"left", "center", "right"}, p.Alignment) &&
		slices.Contains(referenceStyles, p.ReferenceStyle) &&
		slices.Contains([]string{"before", "after"}, p.ReferencePosition) &&
		slices.Contains([]string{"arabic", "chinese"}, p.ChapterNumerals) &&
		slices.Contains([]string{"none", "book", "corner", "square"}, p.ReferenceBrackets) &&
		slices.Contains([]string{"zh-CN", "en"}, p.UILanguage)
}

type ProjectionState struct {
	Revision  uint64          `json:"revision"`
	Reference string          `json:"reference"`
	Passage   *bible.Passage  `json:"passage"`
	Style     ProjectionStyle `json:"style"`
	PageIndex int             `json:"pageIndex"`
	Blank     bool            `json:"blank"`
}
type projectionStore struct {
	mu    sync.Mutex
	state ProjectionState
}
type projectionHost interface {
	ProjectionWindow(string) error
	ProjectionChanged(ProjectionState)
}

func (s *Service) GetProjection() Result[ProjectionState] {
	s.projection.mu.Lock()
	defer s.projection.mu.Unlock()
	return success(s.projection.state)
}
func (s *Service) emitProjection(state ProjectionState) Result[ProjectionState] {
	if host, ok := s.Desktop.(projectionHost); ok {
		host.ProjectionChanged(state)
	}
	return success(state)
}

// Empty reference changes styling without replacing the last confirmed passage.
func (s *Service) SetProjection(reference, translation string, style ProjectionStyle) Result[ProjectionState] {
	if !style.valid() {
		return failure[ProjectionState]("INVALID_SETTINGS")
	}
	var passage *bible.Passage
	if reference != "" {
		p, err := s.Data.ResolveReference(reference, translation)
		if err != nil {
			return failure[ProjectionState](err.Error())
		}
		passage = &p
	}
	s.projection.mu.Lock()
	state := s.projection.state
	if passage != nil {
		state.Passage, state.Reference, state.PageIndex, state.Blank = passage, reference, 0, false
	}
	state.Style = style
	if state.Passage != nil {
		state.PageIndex = min(state.PageIndex, (len(state.Passage.Verses)-1)/style.VersesPerPage)
	}
	state.Revision++
	s.projection.state = state
	s.projection.mu.Unlock()
	return s.emitProjection(state)
}
func (s *Service) ControlProjection(action string) Result[ProjectionState] {
	s.projection.mu.Lock()
	state := s.projection.state
	last := 0
	if state.Passage != nil {
		last = (len(state.Passage.Verses) - 1) / state.Style.VersesPerPage
	}
	switch action {
	case "next":
		state.PageIndex = min(last, state.PageIndex+1)
	case "previous":
		state.PageIndex = max(0, state.PageIndex-1)
	case "blank":
		state.Blank = !state.Blank
	default:
		s.projection.mu.Unlock()
		return failure[ProjectionState]("INVALID_SETTINGS")
	}
	state.Revision++
	s.projection.state = state
	s.projection.mu.Unlock()
	return s.emitProjection(state)
}
func (s *Service) ProjectionWindow(action string) Result[bool] {
	if !slices.Contains([]string{"show", "fullscreen", "window", "stop", "controls", "toggle-fullscreen", "escape"}, action) {
		return failure[bool]("INVALID_SETTINGS")
	}
	host, ok := s.Desktop.(projectionHost)
	if !ok || host.ProjectionWindow(action) != nil {
		return failure[bool]("BRIDGE_UNAVAILABLE")
	}
	return success(true)
}
