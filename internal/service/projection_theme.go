package service

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed projection-themes.json
var projectionThemesJSON []byte

var projectionThemes = func() []struct {
	ID, BackgroundColor, TextColor, Alignment string
} {
	var themes []struct{ ID, BackgroundColor, TextColor, Alignment string }
	if err := json.Unmarshal(projectionThemesJSON, &themes); err != nil {
		panic(err)
	}
	return themes
}()

// Legacy settings have colors but no theme ID. Retain overrides and infer a
// matching preset without rewriting saved colors or other formatting options.
func (p ProjectionStyle) normalizedTheme() ProjectionStyle {
	known := p.ThemeID == ""
	for _, theme := range projectionThemes {
		if theme.ID == p.ThemeID {
			known = true
			if strings.EqualFold(theme.BackgroundColor, p.BackgroundColor) &&
				strings.EqualFold(theme.TextColor, p.TextColor) && theme.Alignment == p.Alignment {
				return p
			}
		}
	}
	if !known {
		return p
	}
	p.ThemeID = "custom"
	for _, theme := range projectionThemes {
		if strings.EqualFold(theme.BackgroundColor, p.BackgroundColor) &&
			strings.EqualFold(theme.TextColor, p.TextColor) && theme.Alignment == p.Alignment {
			p.ThemeID = theme.ID
			break
		}
	}
	return p
}
func validProjectionTheme(id string) bool {
	if id == "custom" {
		return true
	}
	for _, theme := range projectionThemes {
		if theme.ID == id {
			return true
		}
	}
	return false
}
