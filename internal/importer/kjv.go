package importer

import (
	_ "embed"
	"encoding/json"
	"strconv"

	"github.com/xibolun/bible/internal/bible"
)

// Counts only, extracted from the previously pinned CrossWire KJV 3.1 index.
// This reference table contains no scripture and does not require a KJV edition.
// SWORD counts module/testament, book and chapter introductions as index slots.
// https://www.crosswire.org/jsword/javadoc/org/crosswire/jsword/versification/Versification.html
//
//go:embed kjv-counts.json
var kjvCountsJSON []byte

func kjvReferences(canon *bible.Dataset, testament string, introductions bool) ([]Record, error) {
	var counts map[string][]int
	if err := json.Unmarshal(kjvCountsJSON, &counts); err != nil || len(canon.Books) != 66 {
		return nil, fail("SCHEMA_UNSUPPORTED", "KJV reference table")
	}
	refs := []Record{}
	if introductions {
		refs = append(refs, Record{}, Record{})
	}
	for i, b := range canon.Books {
		if testament == ".ot" && i >= 39 || testament == ".nt" && i < 39 {
			continue
		}
		chapters := counts[b.ID]
		if len(chapters) != b.Chapters {
			return nil, fail("SCHEMA_UNSUPPORTED", "KJV reference table")
		}
		if introductions {
			refs = append(refs, Record{})
		}
		for ch, verses := range chapters {
			if introductions {
				refs = append(refs, Record{})
			}
			for v := 1; v <= verses; v++ {
				refs = append(refs, Record{Book: b.ID, Chapter: ch + 1, Label: strconv.Itoa(v)})
			}
		}
	}
	return refs, nil
}
