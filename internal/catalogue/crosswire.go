// Package catalogue reads the official CrossWire index and downloads selected
// modules. It never installs a module or accepts URLs supplied by the frontend.
package catalogue

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/xibolun/bible/internal/importer"
)

const IndexURL = "https://www.crosswire.org/ftpmirror/pub/sword/raw/mods.d.tar.gz"
const ZIPBase = "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/"

type Module struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Language  string `json:"language"`
	Version   string `json:"version"`
	License   string `json:"license"`
	About     string `json:"about"`
	Size      int64  `json:"size"`
	Supported bool   `json:"supported"`
	Reason    string `json:"reason"`
}
type Client struct {
	HTTP              *http.Client
	IndexURL, ZIPBase string
}

func New() *Client {
	return &Client{HTTP: &http.Client{Timeout: 90 * time.Second}, IndexURL: IndexURL, ZIPBase: ZIPBase}
}
func problem(code, where string) error { return &importer.Problem{Code: code, Position: where} }

var moduleID = regexp.MustCompile(`^[A-Za-z0-9_]{1,80}$`)

func (c *Client) get(ctx context.Context, address string) (*http.Response, error) {
	origin, err := url.Parse(address)
	if err != nil {
		return nil, problem("SOURCE_UNAVAILABLE", "CrossWire")
	}
	client := *c.HTTP
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 4 || req.URL.Scheme != origin.Scheme || req.URL.Host != origin.Host {
			return fmt.Errorf("untrusted redirect")
		}
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Bible-Desktop/edition-manager")
	response, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, problem("SOURCE_UNAVAILABLE", "CrossWire")
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, problem("SOURCE_UNAVAILABLE", "CrossWire HTTP status")
	}
	return response, nil
}

func (c *Client) List(ctx context.Context) ([]Module, error) {
	response, err := c.get(ctx, c.IndexURL)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil {
		return nil, problem("SOURCE_UNAVAILABLE", "index download")
	}
	if len(raw) > 2<<20 {
		return nil, problem("IMPORT_LIMIT", "module index")
	}
	return ParseIndex(ctx, raw)
}

// ParseIndex never extracts TAR names to disk, and validates the complete GZIP
// checksum and bounded TAR output even after its end-of-archive marker.
func ParseIndex(ctx context.Context, raw []byte) ([]Module, error) {
	input := bytes.NewReader(raw)
	compressed, err := gzip.NewReader(input)
	if err != nil {
		return nil, problem("INVALID_CONTENT", "CrossWire index GZIP")
	}
	defer compressed.Close()
	compressed.Multistream(false)
	bounded := &io.LimitedReader{R: compressed, N: (16 << 20) + 1}
	archive := tar.NewReader(bounded)
	modules := []Module{}
	seen := map[string]bool{}
	paths := map[string]bool{}
	for count := 0; ; count++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if count > 8192 {
			return nil, problem("IMPORT_LIMIT", "index entries")
		}
		header, err := archive.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, problem("INVALID_CONTENT", "CrossWire TAR")
		}
		name := path.Clean(header.Name)
		if path.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") || strings.ContainsAny(name, "\\:") || paths[name] {
			return nil, problem("INVALID_CONTENT", "index path")
		}
		paths[name] = true
		if header.Typeflag == tar.TypeDir {
			continue
		}
		if header.Typeflag != tar.TypeReg || header.Size < 0 || header.Size > 128<<10 {
			return nil, problem("INVALID_CONTENT", "index entry")
		}
		if path.Dir(name) != "mods.d" || !strings.HasSuffix(name, ".conf") {
			return nil, problem("INVALID_CONTENT", "index configuration path")
		}
		body, err := io.ReadAll(archive)
		if err != nil {
			return nil, problem("INVALID_CONTENT", "index configuration")
		}
		values := map[string]string{}
		id := ""
		sections := 0
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
				sections++
				if id == "" {
					id = line[1 : len(line)-1]
				}
			}
			if key, value, ok := strings.Cut(line, "="); ok {
				values[strings.TrimSpace(key)] = strings.TrimSpace(value)
			}
		}
		driver, lang := values["ModDrv"], values["Lang"]
		if driver != "zText" && driver != "zText4" && driver != "RawText" && driver != "RawText4" {
			continue
		}
		if !Chinese(lang) && lang != "en" {
			continue
		}
		if sections != 1 {
			continue
		}
		if !moduleID.MatchString(id) || seen[id] {
			return nil, problem("INVALID_CONTENT", "module identity")
		}
		seen[id] = true
		size, _ := strconv.ParseInt(values["InstallSize"], 10, 64)
		if size < 0 {
			size = 0
		}
		module := Module{ID: id, Name: values["Description"], Language: lang, Version: values["Version"], License: values["DistributionLicense"], About: strings.ReplaceAll(values["About"], `\par`, "\n"), Size: size}
		if module.Name == "" {
			module.Name = id
		}
		if module.License == "" {
			module.License = "No license information supplied / 未提供版权说明"
		}
		if _, err := importer.InspectSWORDConfig(body); err == nil {
			module.Supported = true
		} else {
			module.Reason, _ = importer.Describe(err)
		}
		modules = append(modules, module)
	}
	if _, err := io.Copy(io.Discard, bounded); err != nil {
		return nil, problem("INVALID_CONTENT", "index checksum")
	}
	if bounded.N <= 0 {
		return nil, problem("IMPORT_LIMIT", "expanded index")
	}
	if input.Len() != 0 {
		return nil, problem("INVALID_CONTENT", "trailing index data")
	}
	sort.Slice(modules, func(i, j int) bool { return strings.ToLower(modules[i].Name) < strings.ToLower(modules[j].Name) })
	return modules, nil
}
func Chinese(language string) bool {
	return language == "zh" || strings.HasPrefix(language, "zh-") || strings.HasPrefix(language, "zh_") || language == "cmn" || language == "zho" || language == "chi"
}

func (c *Client) Download(ctx context.Context, id string, out io.Writer, progress func(int64, int64)) error {
	if !moduleID.MatchString(id) {
		return problem("INVALID_CONTENT", "module identity")
	}
	response, err := c.get(ctx, c.ZIPBase+id+".zip")
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.ContentLength > importer.MaxFile {
		return problem("IMPORT_LIMIT", "download size")
	}
	var copied int64
	buffer := make([]byte, 32<<10)
	total := response.ContentLength
	if total < 0 {
		total = 0
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, readErr := response.Body.Read(buffer)
		if n > 0 {
			copied += int64(n)
			if copied > importer.MaxFile {
				return problem("IMPORT_LIMIT", "download size")
			}
			if written, err := out.Write(buffer[:n]); err != nil || written != n {
				return problem("IMPORT_IO", "download staging")
			}
			progress(copied, total)
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return problem("SOURCE_UNAVAILABLE", "module download")
		}
	}
	if copied == 0 {
		return problem("INVALID_CONTENT", "empty module download")
	}
	return nil
}
