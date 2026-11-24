package importer

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"

	"github.com/xibolun/bible/internal/bible"
)

var osisBooks = strings.Fields("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev")

func attr(el xml.StartElement, key string) string {
	for _, a := range el.Attr {
		if a.Name.Local == key {
			return a.Value
		}
	}
	return ""
}
func osisRef(value string, canon *bible.Dataset) (Record, error) {
	refs := strings.Fields(value)
	if len(refs) == 0 {
		return Record{}, fail("REFERENCE_UNSUPPORTED", "empty OSIS reference")
	}
	// OSIS uses space-separated identities for joined verses, not duplicate text.
	var first Record
	last := 0
	for i, ref := range refs {
		p := strings.Split(ref, ".")
		if len(p) != 3 {
			return first, fail("REFERENCE_UNSUPPORTED", "OSIS "+value)
		}
		var book string
		for n, id := range osisBooks {
			if id == p[0] {
				book = canon.Books[n].ID
				break
			}
		}
		ch, err := strconv.Atoi(p[1])
		if err != nil || book == "" {
			return first, fail("REFERENCE_UNSUPPORTED", "OSIS "+value)
		}
		n, to, ok := LabelRange(p[2])
		if !ok {
			return first, fail("REFERENCE_UNSUPPORTED", "OSIS "+value)
		}
		if i == 0 {
			first = Record{Book: book, Chapter: ch, Label: p[2]}
			last = to
		} else {
			if book != first.Book || ch != first.Chapter || n != last+1 || n != to {
				return first, fail("REFERENCE_UNSUPPORTED", "non-contiguous OSIS range")
			}
			last = n
		}
	}
	if len(refs) > 1 {
		n, _, _ := LabelRange(first.Label)
		first.Label = fmt.Sprintf("%d-%d", n, last)
	}
	return first, nil
}
func parseXML(ctx context.Context, r io.Reader, d *Draft, canon *bible.Dataset) error {
	dec := xml.NewDecoder(r)
	dec.CharsetReader = func(label string, in io.Reader) (io.Reader, error) {
		if strings.EqualFold(label, "utf-8") || strings.EqualFold(label, "utf-16") {
			return in, nil
		}
		return nil, fail("ENCODING_UNSUPPORTED", "XML encoding")
	}
	depth := 0
	rootSeen := false
	skip := 0
	header := 0
	metaKey := ""
	var meta strings.Builder
	var text strings.Builder
	var verse *Record
	sid := ""
	container := false
	book := ""
	chapter := 0
	total := 0
	flush := func() error {
		if verse == nil {
			return fail("INVALID_CONTENT", "unmatched verse end")
		}
		verse.Text = strings.TrimSpace(text.String())
		total += len(verse.Text)
		if total > MaxText || len(d.Records) >= 100000 {
			return fail("IMPORT_LIMIT", "text size")
		}
		d.Records = append(d.Records, *verse)
		verse = nil
		text.Reset()
		sid = ""
		container = false
		return nil
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			var p *Problem
			if errors.As(err, &p) {
				return p
			}
			return fail("INVALID_CONTENT", fmt.Sprintf("XML byte %d", dec.InputOffset()))
		}
		switch el := tok.(type) {
		case xml.Directive:
			return fail("FORMAT_UNSUPPORTED", "XML DTD/directive")
		case xml.StartElement:
			depth++
			if depth > 64 || len(el.Attr) > 64 {
				return fail("IMPORT_LIMIT", "XML nesting/attributes")
			}
			for _, a := range el.Attr {
				if len(a.Value) > 64<<10 {
					return fail("IMPORT_LIMIT", "XML attribute")
				}
			}
			name := el.Name.Local
			if depth == 1 {
				if rootSeen {
					return fail("INVALID_CONTENT", "multiple XML roots")
				}
				rootSeen = true
				switch name {
				case "osis":
					d.Format = "osis"
					d.Profile = "OSIS 2.1.1 scripture subset"
					if el.Name.Space != "" && el.Name.Space != "http://www.bibletechnologies.net/2003/OSIS/namespace" {
						return fail("SCHEMA_UNSUPPORTED", "OSIS namespace")
					}
				case "XMLBIBLE":
					if el.Name.Space != "" {
						return fail("SCHEMA_UNSUPPORTED", "Zefania namespace")
					}
					d.Format = "zefania"
					d.Profile = "Zefania zef2005 2.0.1 scripture subset"
					d.Name = attr(el, "biblename")
					d.SourceEdition = attr(el, "revision")
				default:
					return fail("FORMAT_UNSUPPORTED", "XML root "+name)
				}
			}
			if skip > 0 {
				continue
			}
			if name == "header" || name == "INFORMATION" {
				header = depth
				continue
			}
			if header > 0 {
				if name != "work" && name != "revisionDesc" {
					metaKey = name
					meta.Reset()
				}
				continue
			}
			excluded := name == "note" || name == "title" || name == "NOTE" || name == "XREF" || name == "PROLOG" || name == "CAPTION" || name == "REMARK" || name == "MEDIA"
			if excluded {
				skip = depth
				continue
			}
			if d.Format == "zefania" {
				switch name {
				case "XMLBIBLE":
				case "BIBLEBOOK":
					n, _ := strconv.Atoi(attr(el, "bnumber"))
					if n < 1 || n > len(canon.Books) {
						return fail("REFERENCE_UNSUPPORTED", "Zefania book")
					}
					book = canon.Books[n-1].ID
				case "CHAPTER":
					chapter, _ = strconv.Atoi(attr(el, "cnumber"))
				case "VERS":
					if verse != nil || book == "" || chapter < 1 {
						return fail("INVALID_CONTENT", "Zefania verse nesting")
					}
					label := attr(el, "vnumber")
					if label == "" {
						label = attr(el, "v")
					}
					if end := attr(el, "e"); end != "" {
						label += "-" + end
					}
					label += attr(el, "aix")
					verse = &Record{Book: book, Chapter: chapter, Label: label}
					container = true
				case "STYLE", "GRAM", "SUP":
					if verse == nil {
						return fail("INVALID_CONTENT", "Zefania inline location")
					}
				case "BR":
					if verse != nil {
						text.WriteByte('\n')
					}
				default:
					return fail("FORMAT_UNSUPPORTED", "Zefania element "+name)
				}
			} else {
				switch name {
				case "osis", "osisText", "chapter", "p", "lg":
				case "div":
					if attr(el, "type") == "book" {
						id := attr(el, "osisID")
						if id != "" && !slices.Contains(osisBooks, id) {
							return fail("REFERENCE_UNSUPPORTED", "OSIS book "+id)
						}
					}
				case "verse":
					if end := attr(el, "eID"); end != "" {
						if verse == nil || sid != end {
							return fail("INVALID_CONTENT", "OSIS milestone pairing")
						}
						if err = flush(); err != nil {
							return err
						}
						continue
					}
					if verse != nil {
						return fail("INVALID_CONTENT", "nested OSIS verse")
					}
					record, e := osisRef(attr(el, "osisID"), canon)
					if e != nil {
						return e
					}
					verse = &record
					sid = attr(el, "sID")
					container = sid == ""
				case "l", "lb":
					if verse != nil && text.Len() > 0 {
						text.WriteByte('\n')
					}
				case "q":
					if attr(el, "marker") != "" {
						return fail("FORMAT_UNSUPPORTED", "OSIS generated quote markers")
					}
				case "w", "hi", "seg", "transChange", "foreign", "reference", "name", "abbr", "milestone":
				default:
					return fail("FORMAT_UNSUPPORTED", "OSIS element "+name)
				}
			}
		case xml.EndElement:
			name := el.Name.Local
			if skip > 0 {
				if depth == skip {
					skip = 0
				}
				depth--
				continue
			}
			if header > 0 {
				if metaKey == name {
					value := strings.TrimSpace(meta.String())
					if len(value) > 64<<10 || len(d.Metadata) > 128 {
						return fail("IMPORT_LIMIT", "XML metadata")
					}
					d.Metadata[name] = value
					metaKey = ""
				}
				if depth == header {
					header = 0
				}
				depth--
				continue
			}
			if (name == "VERS" || name == "verse") && container {
				if err = flush(); err != nil {
					return err
				}
			}
			depth--
		case xml.CharData:
			if skip > 0 {
				continue
			}
			if header > 0 && metaKey != "" {
				if meta.Len()+len(el) > 64<<10 {
					return fail("IMPORT_LIMIT", "XML metadata")
				}
				meta.Write(el)
			} else if verse != nil {
				if text.Len()+len(el) > 64<<10 {
					return fail("IMPORT_LIMIT", "XML verse")
				}
				text.Write(el)
			} else if strings.TrimSpace(string(el)) != "" {
				return fail("INVALID_CONTENT", "unassigned XML scripture text")
			}
		}
	}
	if verse != nil || depth != 0 || d.Format == "" {
		return fail("INVALID_CONTENT", "incomplete XML")
	}
	if d.Name == "" {
		d.Name = d.Metadata["title"]
	}
	d.Abbreviation = d.Metadata["identifier"]
	d.Language = d.Metadata["language"]
	d.License = d.Metadata["rights"]
	d.SourceURL = d.Metadata["source"]
	if d.SourceEdition == "" {
		d.SourceEdition = d.Metadata["date"]
	}
	// A supported schema does not by itself verify semantic verse alignment.
	return nil
}
