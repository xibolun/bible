package annotations

import (
	"reflect"
	"testing"
)

func TestPaintKeepsUnaffectedText(t *testing.T) {
	old := []Interval{{0, 10, "yellow"}}
	got := Paint(old, 3, 6, "green")
	want := []Interval{{0, 3, "yellow"}, {3, 6, "green"}, {6, 10, "yellow"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	got = Paint(got, 4, 8, "")
	want = []Interval{{0, 3, "yellow"}, {3, 4, "green"}, {8, 10, "yellow"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	got = Paint([]Interval{{0, 3, "yellow"}, {6, 10, "yellow"}}, 3, 6, "yellow")
	if !reflect.DeepEqual(got, []Interval{{0, 10, "yellow"}}) {
		t.Fatal(got)
	}
}

func FuzzPaintMatchesPerCharacterModel(f *testing.F) {
	f.Add([]byte{1, 5, 2, 3, 8, 1, 0, 9, 0})
	f.Fuzz(func(t *testing.T, raw []byte) {
		old := []Interval{}
		model := make([]string, 20)
		palette := []string{"", "yellow", "green"}
		for i := 0; i+2 < len(raw) && i < 300; i += 3 {
			a, b := int(raw[i])%20, int(raw[i+1])%20
			if a > b {
				a, b = b, a
			}
			if a == b {
				continue
			}
			c := palette[int(raw[i+2])%3]
			old = Paint(old, a, b, c)
			for k := a; k < b; k++ {
				model[k] = c
			}
			for k := range model {
				actual := ""
				for _, p := range old {
					if p.Start <= k && k < p.End {
						actual = p.Color
					}
				}
				if actual != model[k] {
					t.Fatal("interval model diverged")
				}
			}
		}
	})
}
