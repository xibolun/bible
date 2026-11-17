package annotations

import "sort"

type Interval struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Color string `json:"color"`
}

// Paint replaces only the touched range; an empty color erases it.
func Paint(old []Interval, start, end int, color string) []Interval {
	out := []Interval{}
	for _, p := range old {
		if p.End <= start || p.Start >= end {
			out = append(out, p)
			continue
		}
		if p.Start < start {
			out = append(out, Interval{p.Start, start, p.Color})
		}
		if p.End > end {
			out = append(out, Interval{end, p.End, p.Color})
		}
	}
	if color != "" {
		out = append(out, Interval{start, end, color})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start < out[j].Start })
	merged := []Interval{}
	for _, p := range out {
		if len(merged) > 0 && merged[len(merged)-1].End == p.Start && merged[len(merged)-1].Color == p.Color {
			merged[len(merged)-1].End = p.End
		} else {
			merged = append(merged, p)
		}
	}
	return merged
}
