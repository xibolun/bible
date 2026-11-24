package importer

import (
	"archive/zip"
	"bufio"
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/xibolun/bible/internal/bible"
)

// Native, read-only zText profile. No SWORD runtime, supplied filters or external
// converters are executed. See CrossWire's ZVerseBackend index documentation.
func parseSwordZIP(ctx context.Context, files map[string]*zip.File, conf *zip.File, canon *bible.Dataset) (*Draft, error) {
	config, err := swordFile(ctx, conf, 64<<10)
	if err != nil {
		return nil, err
	}
	d := &Draft{Format: "sword", Profile: "SWORD zText/ZIP/OSIS/UTF-8/KJV profile 1", Metadata: map[string]string{}, Versification: "KJV"}
	scanner := bufio.NewScanner(bytes.NewReader(config))
	continuation := ""
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !utf8.ValidString(line) || strings.ContainsRune(line, 0) {
			return nil, fail("ENCODING_UNSUPPORTED", "SWORD configuration")
		}
		if continuation != "" {
			line = continuation + line
			continuation = ""
		}
		if strings.HasSuffix(line, "\\") {
			continuation = strings.TrimSuffix(line, "\\")
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			if d.Abbreviation != "" || len(d.Metadata) > 0 || !swordModuleName.MatchString(line[1:len(line)-1]) {
				return nil, fail("FORMAT_AMBIGUOUS", "SWORD module sections")
			}
			d.Abbreviation = line[1 : len(line)-1]
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if !ok || d.Abbreviation == "" || key == "" {
			return nil, fail("INVALID_CONTENT", "SWORD configuration")
		}
		if _, exists := d.Metadata[key]; exists {
			if key != "GlobalOptionFilter" && key != "Feature" {
				return nil, fail("INVALID_CONTENT", "duplicate SWORD configuration key")
			}
			value = d.Metadata[key] + "\n" + value
		}
		d.Metadata[key] = value
		if len(d.Metadata) > 128 {
			return nil, fail("IMPORT_LIMIT", "SWORD metadata")
		}
	}
	if scanner.Err() != nil || continuation != "" || d.Abbreviation == "" {
		return nil, fail("INVALID_CONTENT", "SWORD configuration")
	}
	m := d.Metadata
	if _, encrypted := m["CipherKey"]; encrypted {
		return nil, fail("ENCRYPTED_MODULE", "SWORD")
	}
	if m["ModDrv"] != "zText" || m["CompressType"] != "ZIP" || m["SourceType"] != "OSIS" || m["Encoding"] != "UTF-8" {
		return nil, fail("FORMAT_UNSUPPORTED", "SWORD requires zText/ZIP/OSIS/UTF-8")
	}
	if m["Versification"] != "" && m["Versification"] != "KJV" {
		return nil, fail("REFERENCE_UNSUPPORTED", "SWORD versification")
	}
	blockType := map[string]string{"BOOK": "b", "CHAPTER": "c", "VERSE": "v"}[m["BlockType"]]
	if blockType == "" {
		return nil, fail("FORMAT_UNSUPPORTED", "SWORD block type")
	}
	for key := range m {
		if strings.Contains(strings.ToLower(key), "filter") && key != "GlobalOptionFilter" || key == "OSISqToTick" && m[key] != "false" {
			return nil, fail("FORMAT_UNSUPPORTED", "SWORD text transformation "+key)
		}
	}
	for _, filter := range strings.Split(m["GlobalOptionFilter"], "\n") {
		switch filter {
		case "", "OSISHeadings", "OSISFootnotes", "OSISScripref", "OSISLemma", "OSISStrongs", "OSISMorph", "OSISRedLetterWords":
		default:
			return nil, fail("FORMAT_UNSUPPORTED", "SWORD option filter")
		}
	}
	dataPath := strings.TrimSuffix(strings.TrimPrefix(m["DataPath"], "./"), "/")
	if path.Clean(dataPath) != dataPath || !strings.HasPrefix(dataPath, "modules/texts/ztext/") || strings.Contains(dataPath, "\\") || strings.Contains(dataPath, ":") {
		return nil, fail("INVALID_CONTENT", "SWORD DataPath")
	}
	d.Name, d.Language, d.SourceEdition, d.SourceURL = m["Description"], m["Lang"], m["Version"], m["TextSource"]
	if d.Name == "" {
		d.Name = d.Abbreviation
	}
	if d.Language == "" {
		d.Language = "und"
	}
	d.License = strings.TrimSpace(m["DistributionLicense"] + "\n" + strings.ReplaceAll(m["About"], `\par`, "\n") + "\n" + m["Copyright"] + "\n" + m["DistributionNotes"])
	if d.License == "" {
		d.License = "No license information supplied / 文件未提供版权说明"
	}
	total := 0
	textBytes := 0
	for _, testament := range []string{"ot", "nt"} {
		stem := dataPath + "/" + testament + "." + blockType + "z"
		indexFile, blockFile, textFile := files[stem+"v"], files[stem+"s"], files[stem+"z"]
		if indexFile == nil && blockFile == nil && textFile == nil {
			continue
		}
		if indexFile == nil || blockFile == nil || textFile == nil {
			return nil, fail("INVALID_CONTENT", "incomplete SWORD testament")
		}
		refs, err := kjvReferences(canon, "."+testament, true)
		if err != nil {
			return nil, err
		}
		index, err := swordFile(ctx, indexFile, int64(len(refs)*10))
		if err != nil {
			return nil, err
		}
		if len(index) != len(refs)*10 {
			return nil, fail("REFERENCE_UNSUPPORTED", "SWORD KJV index length")
		}
		blockIndex, err := swordFile(ctx, blockFile, 2<<20)
		if err != nil {
			return nil, err
		}
		if len(blockIndex)%12 != 0 {
			return nil, fail("INVALID_CONTENT", "SWORD block index")
		}
		compressed, err := swordFile(ctx, textFile, MaxFile)
		if err != nil {
			return nil, err
		}
		blocks := make([][]byte, len(blockIndex)/12)
		for i := range blocks {
			item := blockIndex[i*12 : i*12+12]
			start, size, full := swordUint(item), swordUint(item[4:]), swordUint(item[8:])
			if start+size > uint64(len(compressed)) || size == 0 {
				return nil, fail("INVALID_CONTENT", "SWORD compressed block bounds")
			}
			if full > 32<<20 || uint64(total)+full > MaxFile {
				return nil, fail("IMPORT_LIMIT", "SWORD decompressed text")
			}
			input := bytes.NewReader(compressed[start : start+size])
			reader, err := zlib.NewReader(input)
			if err != nil {
				return nil, fail("INVALID_CONTENT", "SWORD zlib header")
			}
			block, readErr := io.ReadAll(io.LimitReader(&contextReader{ctx, reader}, int64(full)+1))
			_ = reader.Close()
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			// Some SWORD writers reserve exactly 1024 zero bytes after the
			// zlib stream (including Darby 2.0). This is not a second stream.
			paddingOK := input.Len() == 0
			if input.Len() == 1024 {
				padding, _ := io.ReadAll(input)
				paddingOK = bytes.Count(padding, []byte{0}) == len(padding)
			}
			if readErr != nil || uint64(len(block)) != full || !paddingOK {
				return nil, fail("INVALID_CONTENT", "SWORD compressed block integrity")
			}
			blocks[i] = block
			total += len(block)
		}
		seen := map[string]int{}
		lastSlot := -2
		for slot, ref := range refs {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			item := index[slot*10 : slot*10+10]
			block, start, size := swordUint(item), swordUint(item[4:]), uint64(binary.LittleEndian.Uint16(item[8:]))
			if size == 0 {
				continue
			}
			if block >= uint64(len(blocks)) || start+size > uint64(len(blocks[block])) {
				return nil, fail("INVALID_CONTENT", "SWORD verse bounds")
			}
			if ref.Book == "" { // Introductions occupy real index slots, not verses.
				continue
			}
			key := fmt.Sprintf("%d/%d/%d", block, start, size)
			if previous, exists := seen[key]; exists {
				old := &d.Records[previous]
				first, last, _ := LabelRange(old.Label)
				n, _ := strconv.Atoi(ref.Label)
				if slot != lastSlot+1 || old.Book != ref.Book || old.Chapter != ref.Chapter || n != last+1 || previous != len(d.Records)-1 {
					return nil, fail("REFERENCE_UNSUPPORTED", "non-contiguous SWORD linked verses")
				}
				old.Label = fmt.Sprintf("%d-%d", first, n)
				lastSlot = slot
				continue
			}
			text, err := swordOSIS(ctx, blocks[block][start:start+size])
			if err != nil {
				return nil, err
			}
			if text == "" {
				continue
			}
			textBytes += len(text)
			if textBytes > MaxText || len(text) > 64<<10 {
				return nil, fail("IMPORT_LIMIT", "SWORD scripture text")
			}
			ref.Text = text
			seen[key] = len(d.Records)
			d.Records = append(d.Records, ref)
			lastSlot = slot
		}
	}
	note(d, "SWORD卷首、章首介绍未作为经文导入 / SWORD module, testament, book and chapter introductions are excluded")
	return d, nil
}

var swordModuleName = regexp.MustCompile(`^[A-Za-z0-9_]+$`)

func swordUint(b []byte) uint64 { return uint64(binary.LittleEndian.Uint32(b)) }

func swordFile(ctx context.Context, entry *zip.File, limit int64) ([]byte, error) {
	if entry.UncompressedSize64 > uint64(limit) {
		return nil, fail("IMPORT_LIMIT", "SWORD resource size")
	}
	r, err := entry.Open()
	if err != nil {
		return nil, fail("INVALID_CONTENT", "SWORD ZIP entry")
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(&contextReader{ctx, r}, limit+1))
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil || len(b) > int(limit) {
		return nil, fail("INVALID_CONTENT", "SWORD ZIP integrity")
	}
	return b, nil
}

// SWORD stores OSIS fragments; layout milestones and containers can cross verse
// boundaries, so RawToken is intentional. Notes still require balanced tags.
func swordOSIS(ctx context.Context, raw []byte) (string, error) {
	if !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 {
		return "", fail("ENCODING_UNSUPPORTED", "SWORD verse")
	}
	decoder := xml.NewDecoder(&contextReader{ctx, bytes.NewReader(raw)})
	var out strings.Builder
	var excluded []xml.Name
	boundary := false
	for {
		token, err := decoder.RawToken()
		if err == io.EOF {
			break
		}
		if err != nil {
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			return "", fail("INVALID_CONTENT", "SWORD OSIS fragment")
		}
		switch el := token.(type) {
		case xml.Directive, xml.ProcInst:
			return "", fail("INVALID_CONTENT", "SWORD XML directive")
		case xml.StartElement:
			if len(excluded) > 0 {
				excluded = append(excluded, el.Name)
				if len(excluded) > 64 {
					return "", fail("IMPORT_LIMIT", "SWORD note nesting")
				}
				continue
			}
			if el.Name.Space != "" {
				return "", fail("FORMAT_UNSUPPORTED", "SWORD OSIS namespace")
			}
			switch el.Name.Local {
			case "note", "title":
				excluded = append(excluded, el.Name)
			case "w", "hi", "seg", "transChange", "foreign", "reference", "name", "abbr", "divineName", "milestone", "chapter", "verse":
			case "l", "lb", "lg", "p", "div":
				if out.Len() > 0 {
					out.WriteByte('\n')
				}
			case "q":
				if attr(el, "marker") != "" {
					return "", fail("FORMAT_UNSUPPORTED", "SWORD OSIS generated quotation")
				}
			default:
				return "", fail("FORMAT_UNSUPPORTED", "SWORD OSIS element "+el.Name.Local)
			}
		case xml.EndElement:
			if len(excluded) > 0 {
				if excluded[len(excluded)-1] != el.Name {
					return "", fail("INVALID_CONTENT", "SWORD OSIS note nesting")
				}
				excluded = excluded[:len(excluded)-1]
				boundary = len(excluded) == 0
			}
		case xml.CharData:
			if len(excluded) == 0 {
				if boundary && len(el) > 0 && out.Len() > 0 {
					last, _ := utf8.DecodeLastRuneInString(out.String())
					first, _ := utf8.DecodeRune(el)
					if (unicode.In(last, unicode.Latin) || unicode.IsDigit(last)) && (unicode.In(first, unicode.Latin) || unicode.IsDigit(first)) {
						out.WriteByte(' ')
					}
				}
				out.Write(el)
				boundary = false
			}
		}
	}
	if len(excluded) > 0 {
		return "", fail("INVALID_CONTENT", "unclosed SWORD OSIS note")
	}
	return strings.TrimSpace(out.String()), nil
}
