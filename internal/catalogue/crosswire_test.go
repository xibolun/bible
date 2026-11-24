package catalogue

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/xibolun/bible/internal/importer"
)

const syntheticConf = "[SYN]\nDescription=Synthetic sample\nModDrv=zText\nCompressType=ZIP\nBlockType=BOOK\nEncoding=UTF-8\nSourceType=OSIS\nVersification=KJV\nDataPath=./modules/texts/ztext/syn/\nLang=en\nVersion=1\nDistributionLicense=CC0 fixture\nAbout=Not a Bible edition\n"

func indexFixture(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := gzip.NewWriter(&b)
	w := tar.NewWriter(z)
	for name, body := range files {
		if err := w.WriteHeader(&tar.Header{Name: name, Mode: 0600, Size: int64(len(body))}); err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func TestCatalogueLanguageProfilesAndNotices(t *testing.T) {
	zh := strings.ReplaceAll(strings.ReplaceAll(syntheticConf, "[SYN]", "[ZH]"), "Lang=en", "Lang=zh-Hans")
	unsupported := strings.ReplaceAll(strings.ReplaceAll(zh, "[ZH]", "[UNSUPPORTED]"), "Versification=KJV", "Versification=Catholic")
	other := strings.ReplaceAll(strings.ReplaceAll(zh, "[ZH]", "[FR]"), "Lang=zh-Hans", "Lang=fr")
	dictionary := strings.ReplaceAll(strings.ReplaceAll(zh, "[ZH]", "[DICT]"), "ModDrv=zText", "ModDrv=zLD")
	rows, err := ParseIndex(context.Background(), indexFixture(t, map[string]string{"mods.d/syn.conf": syntheticConf, "mods.d/zh.conf": zh, "mods.d/unsupported.conf": unsupported, "mods.d/fr.conf": other, "mods.d/dict.conf": dictionary}))
	if err != nil || len(rows) != 3 {
		t.Fatalf("wrong catalogue: %+v %v", rows, err)
	}
	seen := map[string]Module{}
	for _, m := range rows {
		seen[m.ID] = m
	}
	if !seen["SYN"].Supported || !seen["ZH"].Supported || seen["UNSUPPORTED"].Supported || seen["UNSUPPORTED"].Reason != "REFERENCE_UNSUPPORTED" || seen["SYN"].License != "CC0 fixture" {
		t.Fatal(seen)
	}
}
func TestCatalogueRejectsCorruptionAndUnsafePaths(t *testing.T) {
	for _, name := range []string{"../unsafe.conf", "/absolute.conf", "mods.d/../unsafe.conf", "mods.d/C:\\unsafe.conf"} {
		_, err := ParseIndex(context.Background(), indexFixture(t, map[string]string{name: syntheticConf}))
		if err == nil {
			t.Fatal("accepted path", name)
		}
	}
	raw := indexFixture(t, map[string]string{"mods.d/syn.conf": syntheticConf})
	raw[len(raw)-5] ^= 1
	if _, err := ParseIndex(context.Background(), raw); err == nil {
		t.Fatal("accepted invalid checksum")
	}
	duplicate := indexFixture(t, map[string]string{"mods.d/syn.conf": syntheticConf, "mods.d/duplicate.conf": syntheticConf})
	if _, err := ParseIndex(context.Background(), duplicate); err == nil {
		t.Fatal("accepted ambiguous module ID")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ParseIndex(ctx, indexFixture(t, map[string]string{"mods.d/syn.conf": syntheticConf})); err != context.Canceled {
		t.Fatal("ignored cancellation", err)
	}
}
func TestHTTPDownloadBoundsErrorsRedirectsAndProgress(t *testing.T) {
	targetHits := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { targetHits++; w.Write([]byte("other source")) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/SYN.zip":
			w.Write([]byte("synthetic payload"))
		case "/LARGE.zip":
			w.Header().Set("Content-Length", "209715201")
		case "/REDIRECT.zip":
			http.Redirect(w, r, target.URL, http.StatusFound)
		default:
			http.Error(w, "missing", 404)
		}
	}))
	defer source.Close()
	c := New()
	c.HTTP = source.Client()
	c.ZIPBase = source.URL + "/"
	var output bytes.Buffer
	var progress int64
	if err := c.Download(context.Background(), "SYN", &output, func(done, total int64) { progress = done }); err != nil || output.String() != "synthetic payload" || progress != int64(output.Len()) {
		t.Fatal("download/progress", err, progress)
	}
	for id, want := range map[string]string{"../SYN": "INVALID_CONTENT", "LARGE": "IMPORT_LIMIT", "REDIRECT": "SOURCE_UNAVAILABLE", "MISSING": "SOURCE_UNAVAILABLE"} {
		err := c.Download(context.Background(), id, io.Discard, func(int64, int64) {})
		if code, _ := importer.Describe(err); code != want {
			t.Fatalf("%s: %v", id, err)
		}
	}
	if targetHits != 0 {
		t.Fatal("followed untrusted redirect")
	}
}
