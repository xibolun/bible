package service

import (
	"encoding/json"
	"github.com/xibolun/bible/internal/bible"
	"math"
	"sync"
	"testing"
)

func TestMultiBookProjectionIsAtomicAndPagesAllPassages(t *testing.T) {
	s, _ := fixture(t)
	s.Data.Books = append(s.Data.Books, bible.Book{ID: "EXO", Name: "出埃及记", Abbreviation: "出", Chapters: 1})
	s.Data.Chapters["cuv/EXO/1"] = []bible.Verse{{Label: "1", Text: "另一卷书的经文"}}
	style := DefaultProjectionStyle()
	style.VersesPerPage = 1
	r := s.SetProjection("GEN1:1-2;出1:1", "cuv", style)
	if !r.OK || len(r.Data.Passages) != 2 || r.Data.Passage.Book.ID != "GEN" || projectionPageCount(*r.Data) != 2 {
		t.Fatalf("wrong group: %+v", r)
	}
	revision := r.Data.Revision
	if s.SetProjection("EXO1:1;GEN1:3", "cuv", style).OK || s.GetProjection().Data.Revision != revision {
		t.Fatal("invalid last segment replaced current display")
	}
	s.ControlProjection("next")
	s.ControlProjection("next")
	if s.GetProjection().Data.PageIndex != 1 {
		t.Fatal("group paging exceeded last page")
	}
	style.VersesPerPage = 2
	r = s.SetProjection("", "", style)
	if !r.OK || len(r.Data.Passages) != 2 || r.Data.PageIndex != 0 {
		t.Fatal("style update lost group or page clamp")
	}
	r = s.SetProjection("EXO1:1;GEN1:2", "cuv", style)
	if !r.OK || r.Data.Passages[0].Book.ID != "EXO" {
		t.Fatal("custom list order lost")
	}
}

func TestProjectionThemesAndLegacyCustomizedColors(t *testing.T) {
	s, _ := fixture(t)
	for _, theme := range projectionThemes {
		p := Defaults()
		p.ProjectionStyle.ThemeID = theme.ID
		p.ProjectionStyle.BackgroundColor = theme.BackgroundColor
		p.ProjectionStyle.TextColor = theme.TextColor
		p.ProjectionStyle.Alignment = theme.Alignment
		if !s.SavePreferences(p).OK || s.GetPreferences().Data.ProjectionStyle.ThemeID != theme.ID {
			t.Fatalf("theme did not persist: %s", theme.ID)
		}
	}
	p := Defaults()
	if err := json.Unmarshal([]byte(`{"projectionStyle":{"backgroundColor":"#f4eddc","textColor":"#392f24"}}`), &p); err != nil {
		t.Fatal(err)
	}
	// Write the old nested JSON directly, bypassing the new save normalization.
	if err := s.Store.SavePreferences(p); err != nil {
		t.Fatal(err)
	}
	if r := s.GetPreferences(); !r.OK || r.Data.ProjectionStyle.ThemeID != "paper" {
		t.Fatal("old warm palette was not inferred")
	}
	p.ProjectionStyle.ThemeID = ""
	p.ProjectionStyle.BackgroundColor = "#123456"
	if !s.SavePreferences(p).OK {
		t.Fatal("legacy custom style rejected")
	}
	saved := s.GetPreferences().Data.ProjectionStyle
	if saved.ThemeID != "custom" || saved.BackgroundColor != "#123456" {
		t.Fatal("custom colors overwritten")
	}
	p.ProjectionStyle.ThemeID = "unknown-theme"
	if s.SavePreferences(p).OK || s.SetProjection("", "", p.ProjectionStyle).OK {
		t.Fatal("unknown theme accepted")
	}
}

func TestProjectionValidationRetentionAndPaging(t *testing.T) {
	s, _ := fixture(t)
	style := DefaultProjectionStyle()
	style.VersesPerPage = 1
	result := s.SetProjection("GEN1:1-2", "cuv", style)
	if !result.OK || result.Data.Revision != 1 || len(result.Data.Passage.Verses) != 2 {
		t.Fatalf("%+v", result)
	}
	for _, reference := range []string{"GEN1:2-1", "GEN1:1-3", "GEN2:1"} {
		if s.SetProjection(reference, "cuv", style).OK {
			t.Fatalf("accepted %s", reference)
		}
		if s.GetProjection().Data.Revision != 1 {
			t.Fatal("invalid query changed last display")
		}
	}
	for i := 0; i < 3; i++ {
		s.ControlProjection("next")
	}
	if s.GetProjection().Data.PageIndex != 1 {
		t.Fatal("paging exceeded last page")
	}
	s.ControlProjection("blank")
	style.FontSize = 100
	result = s.SetProjection("", "", style)
	if !result.OK || !result.Data.Blank || result.Data.Passage == nil || result.Data.PageIndex != 1 {
		t.Fatal("style update replaced content")
	}
	style.VersesPerPage = 2
	if s.SetProjection("", "", style).Data.PageIndex != 0 {
		t.Fatal("page not clamped")
	}
	for i := 0; i < 3; i++ {
		s.ControlProjection("previous")
	}
	if s.GetProjection().Data.PageIndex != 0 {
		t.Fatal("negative page")
	}
	if !s.SetProjection("GEN1:2", "cuv", style).OK || s.GetProjection().Data.Blank {
		t.Fatal("publishing should resume")
	}
	style.BackgroundColor = "url(javascript:alert(1))"
	if s.SetProjection("", "", style).OK {
		t.Fatal("unsafe color accepted")
	}
	style = DefaultProjectionStyle()
	style.FontSize = 121
	if s.SetProjection("", "", style).OK {
		t.Fatal("oversize font accepted")
	}
	if s.ControlProjection("unknown").OK || s.ProjectionWindow("show").OK {
		t.Fatal("invalid action/missing host accepted")
	}
}

func TestProjectionConcurrentCommandsAndLegacyPreferences(t *testing.T) {
	s, _ := fixture(t)
	s.SetProjection("GEN1", "cuv", DefaultProjectionStyle())
	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Go(func() { s.ControlProjection("next"); s.GetProjection() })
	}
	wg.Wait()
	if s.GetProjection().Data.Revision != 31 {
		t.Fatal("lost concurrent update")
	}
	p := Defaults()
	if err := json.Unmarshal([]byte(`{"fontSize":22,"bookId":"GEN","chapter":1}`), &p); err != nil {
		t.Fatal(err)
	}
	if !s.SavePreferences(p).OK || s.GetPreferences().Data.ProjectionStyle.FontSize != 64 {
		t.Fatal("legacy defaults or persistence lost")
	}
	p.ProjectionStyle.FontSize = int(math.MaxInt32)
	if s.SavePreferences(p).OK {
		t.Fatal("invalid nested style saved")
	}
}
