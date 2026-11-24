// Package importer reads explicitly supported Bible formats, never executable
// converters or arbitrary databases. Its records are independent of storage.
package importer

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/xibolun/bible/internal/bible"
)

const MaxFile = 200 << 20
const MaxText = 128 << 20

type Record struct {
	Book    string `json:"book"`
	Chapter int    `json:"chapter"`
	Label   string `json:"label"`
	Text    string `json:"text"`
}
type Draft struct {
	Format        string            `json:"format"`
	Profile       string            `json:"profile"`
	Name          string            `json:"name"`
	Abbreviation  string            `json:"abbreviation"`
	Language      string            `json:"language"`
	SourceEdition string            `json:"sourceEdition"`
	SourceURL     string            `json:"sourceUrl"`
	License       string            `json:"license"`
	Versification string            `json:"versification"`
	Fingerprint   string            `json:"fingerprint"`
	SourceHash    string            `json:"sourceHash"`
	Metadata      map[string]string `json:"metadata"`
	Diagnostics   []string          `json:"diagnostics"`
	Records       []Record          `json:"-"`
	Books         int               `json:"books"`
	Chapters      int               `json:"chapters"`
	Verses        int               `json:"verses"`
}
type Problem struct {
	Code     string
	Position string
}

func (p *Problem) Error() string       { return p.Code }
func fail(code, position string) error { return &Problem{code, position} }
func Describe(err error) (string, string) {
	var p *Problem
	if errors.As(err, &p) {
		return p.Code, p.Position
	}
	if errors.Is(err, context.Canceled) {
		return "IMPORT_CANCELLED", ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "IMPORT_LIMIT", "processing time"
	}
	return "IMPORT_IO", ""
}

// Parse works only on an application's private input snapshot. ZIP entries are
// never extracted using their names, and source schemas are never executed.
func Parse(ctx context.Context, filename, originalName string, canon *bible.Dataset) (*Draft, error) {
	return parse(ctx, filename, originalName, canon, true)
}

func parse(ctx context.Context, filename, originalName string, canon *bible.Dataset, allowArchive bool) (*Draft, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	f, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() > MaxFile {
		return nil, fail("IMPORT_LIMIT", "file size")
	}
	hash := sha256.New()
	if _, err = io.Copy(hash, &contextReader{ctx, f}); err != nil {
		return nil, err
	}
	sourceHash := hex.EncodeToString(hash.Sum(nil))
	if _, err = f.Seek(0, 0); err != nil {
		return nil, err
	}
	var magic [16]byte
	n, _ := f.Read(magic[:])
	_, _ = f.Seek(0, 0)
	isZIP := n >= 4 && string(magic[:2]) == "PK"
	isGZIP := n >= 2 && magic[0] == 0x1f && magic[1] == 0x8b
	if (isZIP || isGZIP) && !allowArchive {
		return nil, fail("FORMAT_UNSUPPORTED", "nested archive")
	}
	if isGZIP {
		snapshot, name, err := unpackGZIP(ctx, f, filepath.Dir(filename), MaxFile)
		if err != nil {
			return nil, err
		}
		defer os.Remove(snapshot)
		if name == "" {
			name = originalName
			if ext := filepath.Ext(name); strings.EqualFold(ext, ".gz") {
				name = strings.TrimSuffix(name, ext)
			}
		}
		// The header name is only a format hint, never an extraction path.
		name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
		d, err := parse(ctx, snapshot, name, canon, false)
		if err == nil {
			d.SourceHash = sourceHash
		}
		return d, err
	}
	if isZIP {
		z, err := zip.NewReader(f, info.Size())
		if err != nil {
			return nil, fail("INVALID_CONTENT", "ZIP")
		}
		if len(z.File) > 128 {
			return nil, fail("IMPORT_LIMIT", "ZIP entries")
		}
		seen := map[string]bool{}
		entries := map[string]*zip.File{}
		var configs []*zip.File
		var candidate *zip.File
		var total uint64
		for _, entry := range z.File {
			name := strings.ReplaceAll(entry.Name, "\\", "/")
			clean := path.Clean(name)
			if strings.HasPrefix(clean, "../") || clean == ".." || path.IsAbs(clean) || strings.Contains(clean, ":") || entry.Mode()&os.ModeSymlink != 0 || seen[clean] {
				return nil, fail("INVALID_CONTENT", "ZIP path")
			}
			seen[clean] = true
			if entry.Flags&1 != 0 {
				return nil, fail("ENCRYPTED_MODULE", "ZIP")
			}
			if entry.UncompressedSize64 > 512<<20 || total > 512<<20-entry.UncompressedSize64 {
				return nil, fail("IMPORT_LIMIT", "ZIP size")
			}
			total += entry.UncompressedSize64
			if entry.FileInfo().IsDir() {
				continue
			}
			entries[clean] = entry
			if path.Dir(clean) == "mods.d" && strings.EqualFold(path.Ext(clean), ".conf") {
				configs = append(configs, entry)
			}
			ext := strings.ToLower(filepath.Ext(name))
			if ext == ".zip" || ext == ".gz" {
				return nil, fail("FORMAT_UNSUPPORTED", "nested archive")
			}
			if strings.HasSuffix(strings.ToLower(name), ".bbl.mybible") || ext == ".sqlite3" || ext == ".xml" || ext == ".osis" || ext == ".ont" || ext == ".ot" || ext == ".nt" {
				if candidate != nil {
					return nil, fail("FORMAT_AMBIGUOUS", "multiple Bible files; extract and select one")
				}
				candidate = entry
			}
		}
		if len(configs) > 0 {
			if len(configs) != 1 || candidate != nil {
				return nil, fail("FORMAT_AMBIGUOUS", "multiple Bible resources")
			}
			d, err := parseSwordZIP(ctx, entries, configs[0], canon)
			if err == nil {
				d.SourceHash = sourceHash
				err = validate(ctx, d, canon)
			}
			return d, err
		}
		if candidate == nil {
			return nil, fail("FORMAT_UNSUPPORTED", "ZIP content")
		}
		in, err := candidate.Open()
		if err != nil {
			return nil, err
		}
		defer in.Close()
		out, err := os.CreateTemp(filepath.Dir(filename), "unpacked-*")
		if err != nil {
			return nil, err
		}
		defer os.Remove(out.Name())
		size, err := io.Copy(out, io.LimitReader(&contextReader{ctx, in}, MaxFile+1))
		closeErr := out.Close()
		if err != nil {
			return nil, err
		}
		if closeErr != nil {
			return nil, closeErr
		}
		if size > MaxFile {
			return nil, fail("IMPORT_LIMIT", "ZIP resource")
		}
		d, err := parse(ctx, out.Name(), candidate.Name, canon, false)
		if err == nil {
			d.SourceHash = sourceHash
		}
		return d, err
	}
	d := &Draft{Metadata: map[string]string{}, Diagnostics: []string{}, Versification: "unknown", SourceHash: sourceHash, Records: []Record{}}
	if string(magic[:]) == "SQLite format 3\x00" {
		err = parseSQLite(ctx, filename, d, canon)
	} else {
		reader, readErr := textReader(&contextReader{ctx, f})
		if readErr != nil {
			return nil, readErr
		}
		buffered := bufio.NewReader(reader)
		prefix, _ := buffered.Peek(128)
		start := strings.TrimSpace(string(prefix))
		ext := strings.ToLower(filepath.Ext(originalName))
		isTheWord := ext == ".ont" || ext == ".ot" || ext == ".nt" || ext == ".ontx" || ext == ".otx" || ext == ".ntx"
		if isTheWord && (magic[0] == 0xff || magic[0] == 0xfe) && !strings.HasPrefix(start, "<osis") && !strings.HasPrefix(start, "<XMLBIBLE") && !strings.HasPrefix(start, "<?xml") {
			return nil, fail("ENCODING_UNSUPPORTED", "theWord UTF-8 profile")
		}
		if strings.HasPrefix(start, "<") && (!isTheWord || strings.HasPrefix(start, "<?xml") || strings.HasPrefix(start, "<osis") || strings.HasPrefix(start, "<XMLBIBLE")) {
			err = parseXML(ctx, buffered, d, canon)
		} else {
			err = parseTheWord(ctx, buffered, originalName, d, canon)
		}
	}
	if err != nil {
		return nil, err
	}
	if err = validate(ctx, d, canon); err != nil {
		return nil, err
	}
	if d.Name == "" {
		d.Name = strings.TrimSuffix(filepath.Base(originalName), filepath.Ext(originalName))
	}
	if d.Abbreviation == "" {
		d.Abbreviation = "LOCAL"
	}
	if d.Language == "" {
		d.Language = "und"
	}
	if d.License == "" {
		d.License = "No license information supplied / 文件未提供版权说明"
	}
	return d, nil
}

type contextReader struct {
	ctx context.Context
	in  io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.in.Read(p)
}

func note(d *Draft, s string) {
	for _, old := range d.Diagnostics {
		if old == s {
			return
		}
	}
	if len(d.Diagnostics) < 40 {
		d.Diagnostics = append(d.Diagnostics, s)
	}
}

var labelPattern = regexp.MustCompile(`^([1-9][0-9]{0,2})([a-z]?)(?:-([1-9][0-9]{0,2}))?$`)

func LabelRange(label string) (int, int, bool) {
	m := labelPattern.FindStringSubmatch(label)
	if m == nil {
		return 0, 0, false
	}
	first, _ := strconv.Atoi(m[1])
	last := first
	if m[3] != "" {
		last, _ = strconv.Atoi(m[3])
		if m[2] != "" || last < first {
			return 0, 0, false
		}
	}
	return first, last, true
}
func validate(ctx context.Context, d *Draft, canon *bible.Dataset) error {
	if len(d.Records) == 0 {
		return fail("INVALID_CONTENT", "no verses")
	}
	if len(d.Records) > 100000 {
		return fail("IMPORT_LIMIT", "verse count")
	}
	order := map[string]int{}
	for i, b := range canon.Books {
		order[b.ID] = i + 1
	}
	seen := map[string]bool{}
	books := map[string]bool{}
	chapters := map[string]bool{}
	total := 0
	nonempty := false
	for i, r := range d.Records {
		if err := ctx.Err(); err != nil {
			return err
		}
		loc := fmt.Sprintf("record %d (%s %d:%s)", i+1, r.Book, r.Chapter, r.Label)
		if order[r.Book] == 0 || r.Chapter < 1 || r.Chapter > 999 {
			return fail("REFERENCE_UNSUPPORTED", loc)
		}
		if _, _, ok := LabelRange(r.Label); !ok {
			return fail("REFERENCE_UNSUPPORTED", loc)
		}
		if strings.Contains(r.Label, "-") {
			note(d, "含合并经节：复制与投影保留完整源引用 / Joined verses retain their complete source citation in copies and projection")
		}
		key := fmt.Sprintf("%s/%d/%s", r.Book, r.Chapter, r.Label)
		if seen[key] {
			return fail("INVALID_CONTENT", loc+" duplicate reference")
		}
		seen[key] = true
		if !utf8.ValidString(r.Text) || strings.ContainsRune(r.Text, 0) {
			return fail("ENCODING_UNSUPPORTED", loc)
		}
		if len(r.Text) > 64<<10 {
			return fail("IMPORT_LIMIT", loc)
		}
		total += len(r.Text)
		if total > MaxText {
			return fail("IMPORT_LIMIT", "text size")
		}
		if strings.TrimSpace(r.Text) != "" {
			nonempty = true
			books[r.Book] = true
			chapters[fmt.Sprintf("%s/%d", r.Book, r.Chapter)] = true
		}
	}
	if !nonempty {
		return fail("INVALID_CONTENT", "no scripture text")
	}
	sort.SliceStable(d.Records, func(i, j int) bool {
		a, b := d.Records[i], d.Records[j]
		if a.Book != b.Book {
			return order[a.Book] < order[b.Book]
		}
		if a.Chapter != b.Chapter {
			return a.Chapter < b.Chapter
		}
		x, _, _ := LabelRange(a.Label)
		y, _, _ := LabelRange(b.Label)
		if x != y {
			return x < y
		}
		return a.Label < b.Label
	})
	// Overlapping source labels cannot be represented without ambiguous selection.
	var previous *Record
	for i := range d.Records {
		b := d.Records[i]
		if b.Text == "" {
			continue
		}
		if previous == nil {
			previous = &d.Records[i]
			continue
		}
		a := *previous
		if a.Book == b.Book && a.Chapter == b.Chapter {
			x, y, _ := LabelRange(a.Label)
			z, _, _ := LabelRange(b.Label)
			m, n := labelPattern.FindStringSubmatch(a.Label), labelPattern.FindStringSubmatch(b.Label)
			if y >= z && !(x == y && m[2] != "" && n[2] != "" && x == z) {
				return fail("REFERENCE_UNSUPPORTED", "overlapping verse ranges")
			}
		}
		previous = &d.Records[i]
	}
	d.Books, d.Chapters, d.Verses = len(books), len(chapters), len(d.Records)
	h := sha256.New()
	enc := json.NewEncoder(h)
	_ = enc.Encode("import-profile-1")
	_ = enc.Encode(d.Versification)
	for _, r := range d.Records {
		if err := enc.Encode(r); err != nil {
			return err
		}
	}
	d.Fingerprint = hex.EncodeToString(h.Sum(nil))
	note(d, "仅导入正文；脚注、标题、Strong编号和排版样式不作为经文 / Scripture text only; notes, headings, Strong tags and styling are excluded")
	if d.Books < 66 {
		note(d, "部分译本；按实际书卷与章节提供阅读 / Partial edition; only supplied books and chapters are available")
	}
	if d.Versification == "unknown" {
		note(d, "节编号体系未验证，不提供自动逐节对照 / Unverified versification; automatic parallel alignment is unavailable")
	}
	return nil
}

func parseTheWord(ctx context.Context, r io.Reader, name string, d *Draft, canon *bible.Dataset) error {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == ".ontx" || ext == ".otx" || ext == ".ntx" {
		return fail("ENCRYPTED_MODULE", "theWord")
	}
	if ext != ".ont" && ext != ".ot" && ext != ".nt" {
		return fail("FORMAT_UNSUPPORTED", "file contents")
	}
	d.Format = "theword"
	d.Profile = "theWord Bible spec 0.10; UTF-8/KJV"
	d.Versification = "KJV"
	refs, err := kjvReferences(canon, ext, false)
	if err != nil {
		return err
	}
	want := 31102
	if ext == ".ot" {
		want = 23145
	}
	if ext == ".nt" {
		want = 7957
	}
	if len(refs) != want {
		return fail("SCHEMA_UNSUPPORTED", "KJV reference index")
	}
	scan := bufio.NewScanner(r)
	scan.Buffer(make([]byte, 4096), 1<<20)
	line := 0
	continuing := ""
	for scan.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		raw := scan.Text()
		line++
		if !utf8.ValidString(raw) {
			return fail("ENCODING_UNSUPPORTED", fmt.Sprintf("line %d", line))
		}
		if line <= want {
			if key, _, ok := strings.Cut(raw, "="); ok {
				switch key {
				case "title", "short.title", "about", "description", "lang", "charset", "version.date", "id":
					return fail("INVALID_CONTENT", fmt.Sprintf("premature metadata at line %d", line))
				}
			}
			plain, err := plainTags(raw, "gbf")
			if err != nil {
				return err
			}
			v := refs[line-1]
			v.Text = plain
			d.Records = append(d.Records, v)
			continue
		}
		if continuing != "" {
			raw = continuing + "\n" + raw
			continuing = ""
		}
		if strings.HasSuffix(raw, "\\") {
			continuing = strings.TrimSuffix(raw, "\\")
			continue
		}
		if strings.TrimSpace(raw) == "" {
			continue
		}
		key, value, ok := strings.Cut(raw, "=")
		if !ok {
			return fail("INVALID_CONTENT", fmt.Sprintf("metadata line %d", line))
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "verse.rule" || key == "tag.rule" || key == "notags" {
			return fail("FORMAT_UNSUPPORTED", "theWord custom rendering rules")
		}
		if len(key) > 100 || len(value) > 64<<10 {
			return fail("IMPORT_LIMIT", "metadata")
		}
		d.Metadata[key] = value
	}
	if scan.Err() != nil {
		return fail("IMPORT_LIMIT", "theWord line")
	}
	if line < want || continuing != "" {
		return fail("INVALID_CONTENT", "theWord line count")
	}
	d.Name = d.Metadata["title"]
	d.Abbreviation = d.Metadata["short.title"]
	d.Language = d.Metadata["lang"]
	d.SourceEdition = d.Metadata["version.date"]
	d.SourceURL = d.Metadata["source"]
	d.License = d.Metadata["about"]
	return nil
}
