package service

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"encoding/binary"
	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/catalogue"
	"github.com/xibolun/bible/internal/editions"
	"github.com/xibolun/bible/internal/storage"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const downloadConf = "[SYN]\nDescription=Synthetic download\nModDrv=zText\nCompressType=ZIP\nBlockType=BOOK\nEncoding=UTF-8\nSourceType=OSIS\nVersification=KJV\nDataPath=./modules/texts/ztext/syn/\nLang=en\nVersion=1\nDistributionLicense=CC0 self-authored sample\n"

func downloadFiles(t *testing.T) ([]byte, []byte) {
	t.Helper()
	var indexArchive bytes.Buffer
	g := gzip.NewWriter(&indexArchive)
	tarWriter := tar.NewWriter(g)
	_ = tarWriter.WriteHeader(&tar.Header{Name: "mods.d/syn.conf", Mode: 0600, Size: int64(len(downloadConf))})
	_, _ = tarWriter.Write([]byte(downloadConf))
	_ = tarWriter.Close()
	_ = g.Close()
	const text = `<inscription><w>Synthetic downloaded words.</w><note><catchWord>excluded</catchWord><rdg>variant</rdg></note> <w>Not scripture.</w></inscription>`
	var compressed bytes.Buffer
	z := zlib.NewWriter(&compressed)
	_, _ = z.Write([]byte(text))
	_ = z.Close()
	verses := make([]byte, 8246*10)
	binary.LittleEndian.PutUint16(verses[48:], uint16(len(text)))
	blocks := make([]byte, 12)
	binary.LittleEndian.PutUint32(blocks[4:], uint32(compressed.Len()))
	binary.LittleEndian.PutUint32(blocks[8:], uint32(len(text)))
	var archive bytes.Buffer
	w := zip.NewWriter(&archive)
	for name, content := range map[string][]byte{"mods.d/syn.conf": []byte(downloadConf), "modules/texts/ztext/syn/nt.bzv": verses, "modules/texts/ztext/syn/nt.bzs": blocks, "modules/texts/ztext/syn/nt.bzz": compressed.Bytes()} {
		entry, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = entry.Write(content)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return indexArchive.Bytes(), archive.Bytes()
}
func downloadService(t *testing.T, server *httptest.Server) (*Service, string) {
	t.Helper()
	root := t.TempDir()
	data, err := bible.Load()
	if err != nil {
		t.Fatal(err)
	}
	lib, err := editions.Open(filepath.Join(root, "editions.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	store, err := storage.Open(filepath.Join(root, "user.db"))
	if err != nil {
		t.Fatal(err)
	}
	s := NewWithEditions(data, store, &editionDesktop{}, lib, filepath.Join(root, "imports"))
	c := catalogue.New()
	c.HTTP = server.Client()
	c.IndexURL = server.URL + "/index"
	c.ZIPBase = server.URL + "/zip/"
	s.editions.source = c
	t.Cleanup(func() { CloseEditionInputs(s); lib.Close(); store.Close() })
	return s, root
}
func awaitDownload(t *testing.T, s *Service, id string) EditionImportJob {
	t.Helper()
	for until := time.Now().Add(5 * time.Second); time.Now().Before(until); {
		r := s.GetEditionImportJob(id)
		if !r.OK {
			t.Fatal(r.Error)
		}
		if r.Data.Status == "ready" || r.Data.Status == "failed" {
			return *r.Data
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("download timeout")
	return EditionImportJob{}
}
func TestCrossWireDownloadPreviewConfirmAndOfflineData(t *testing.T) {
	index, archive := downloadFiles(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/index" {
			w.Write(index)
		} else {
			w.Write(archive)
		}
	}))
	defer server.Close()
	s, root := downloadService(t, server)
	if r := s.DownloadCrossWireEdition("SYN"); r.OK || r.Error.Code != "SOURCE_REFRESH_REQUIRED" {
		t.Fatal("accepted unlisted module")
	}
	if r := s.ListCrossWireEditions(); !r.OK || len(*r.Data) != 1 || !(*r.Data)[0].Supported {
		t.Fatal("catalogue", r.Error)
	}
	start := s.DownloadCrossWireEdition("SYN")
	if !start.OK {
		t.Fatal(start.Error)
	}
	job := awaitDownload(t, s, start.Data.ID)
	if len(job.Samples) != 1 || job.Samples[0].Text != "Synthetic downloaded words. Not scripture." {
		t.Fatalf("inscription preview lost text: %+v", job)
	}
	if job.Status != "ready" || job.Report.Format != "sword" || job.Report.Verses != 1 || !strings.Contains(job.Samples[0].Text, "Synthetic downloaded") || job.DownloadedBytes != int64(len(archive)) {
		t.Fatalf("wrong preview/progress: %+v", job)
	}
	if len(s.editions.library.List()) != 0 {
		t.Fatal("download installed without confirmation")
	}
	committed := s.CommitEditionImport(job.ID, editions.Commit{Name: "Synthetic", Abbreviation: "SYN", Language: "en"})
	if !committed.OK {
		t.Fatal(committed.Error)
	}
	server.Close()
	id := committed.Data.Installed.ID
	if r := s.GetChapter([]string{id}, "MAT", 1, "offline"); !r.OK || r.Data.Rows[0].Cells[0].Text != "Synthetic downloaded words. Not scripture." {
		t.Fatal("offline data", r.Error)
	}
	files, err := os.ReadDir(filepath.Join(root, "imports"))
	if err != nil || len(files) != 0 {
		t.Fatal("staging retained", files, err)
	}
}
func TestCrossWireDownloadCancellationAndSourceChange(t *testing.T) {
	index, archive := downloadFiles(t)
	for _, cancelDownload := range []bool{false, true} {
		t.Run(map[bool]string{true: "cancel", false: "changed"}[cancelDownload], func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/index" {
					w.Write(index)
					return
				}
				if cancelDownload {
					w.Write(archive[:10])
					w.(http.Flusher).Flush()
					<-r.Context().Done()
					return
				}
				w.Write(archive)
			}))
			defer server.Close()
			s, root := downloadService(t, server)
			if r := s.ListCrossWireEditions(); !r.OK {
				t.Fatal(r.Error)
			}
			if !cancelDownload {
				m := s.editions.modules["SYN"]
				m.Version = "changed"
				s.editions.modules["SYN"] = m
			}
			start := s.DownloadCrossWireEdition("SYN")
			if !start.OK {
				t.Fatal(start.Error)
			}
			if cancelDownload {
				r := s.CancelEditionImport(start.Data.ID)
				if !r.OK || r.Data.Status != "cancelled" {
					t.Fatal("cancellation", r.Error)
				}
				CloseEditionInputs(s)
			} else {
				job := awaitDownload(t, s, start.Data.ID)
				if job.Status != "failed" || job.Problem.Code != "SOURCE_CHANGED" {
					t.Fatal("identity not verified", job)
				}
			}
			if len(s.editions.library.List()) != 0 {
				t.Fatal("partial edition installed")
			}
			files, _ := os.ReadDir(filepath.Join(root, "imports"))
			if len(files) != 0 {
				t.Fatal("download staging leaked")
			}
		})
	}
}
