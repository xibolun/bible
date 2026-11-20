package service

import (
	"encoding/json"
	"math"
	"sync"
	"testing"
)

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
