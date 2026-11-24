package service

import (
	"archive/zip"
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/xibolun/bible/internal/bible"
	"github.com/xibolun/bible/internal/editions"
	"github.com/xibolun/bible/internal/storage"
)

func TestSwordImportInstallsAndRestartsWithoutBundledKJV(t *testing.T) {
	root := t.TempDir()
	const text = "[Synthetic] imported words."
	var block bytes.Buffer
	z := zlib.NewWriter(&block)
	_, _ = z.Write([]byte(text))
	_ = z.Close()
	// Exercise the padding used by the supplied Darby module.
	block.Write(make([]byte, 1024))
	index := make([]byte, 8246*10) // KJV NT slots including introductions.
	for _, slot := range []int{4, 5} {
		binary.LittleEndian.PutUint16(index[slot*10+8:], uint16(len(text)))
	}
	blocks := make([]byte, 12)
	binary.LittleEndian.PutUint32(blocks[4:], uint32(block.Len()))
	binary.LittleEndian.PutUint32(blocks[8:], uint32(len(text)))
	var archive bytes.Buffer
	w := zip.NewWriter(&archive)
	for name, content := range map[string][]byte{
		"mods.d/syn.conf":                []byte("[SYN]\nModDrv=zText\nCompressType=ZIP\nBlockType=BOOK\nEncoding=UTF-8\nSourceType=OSIS\nVersification=KJV\nDataPath=./modules/texts/ztext/syn/\nDescription=Synthetic\nLang=en\nDistributionLicense=CC0 self-authored fixture\n"),
		"modules/texts/ztext/syn/nt.bzv": index,
		"modules/texts/ztext/syn/nt.bzs": blocks,
		"modules/texts/ztext/syn/nt.bzz": block.Bytes(),
	} {
		e, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = e.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "synthetic.zip")
	if err := os.WriteFile(file, archive.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
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
	defer store.Close()
	desk := &editionDesktop{filename: file}
	s := NewWithEditions(data, store, desk, lib, filepath.Join(root, "imports"))
	choice := s.ChooseEditionImport()
	if !choice.OK {
		t.Fatal(choice.Error)
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if start := s.InspectEditionImport(choice.Data.Token); !start.OK {
		t.Fatal(start.Error)
	}
	var job EditionImportJob
	for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); {
		r := s.GetEditionImportJob(choice.Data.Token)
		if !r.OK {
			t.Fatal(r.Error)
		}
		job = *r.Data
		if job.Status == "ready" || job.Status == "failed" {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if job.Status != "ready" || job.Report.Format != "sword" || job.Report.Verses != 1 || job.Samples[0].Label != "1-2" {
		t.Fatalf("incorrect preview: %+v", job)
	}
	commit := s.CommitEditionImport(job.ID, editions.Commit{Name: "Synthetic", Abbreviation: "SYN", Language: "en"})
	if !commit.OK || commit.Data.Status != "done" {
		t.Fatal(commit.Error)
	}
	id := commit.Data.Installed.ID
	chapter := s.GetChapter([]string{id, "cuv", "webp"}, "MAT", 1, "sword")
	if !chapter.OK {
		t.Fatal("SWORD comparison lost linked text", chapter.Error)
	}
	linked := 0
	for _, row := range chapter.Data.Rows {
		if row.Label == "1-2" && row.Cells[0].Text == text {
			linked++
		}
	}
	if linked != 1 {
		t.Fatal("linked source must occur exactly once in comparison")
	}
	search := s.SearchScripture(id, "imported%words", 0, 10)
	if !search.OK || search.Data.Total != 1 || search.Data.Results[0].VerseKey != "1-2" {
		t.Fatal("SWORD search failed", search.Error)
	}
	tr, _ := data.Translation(id)
	sel := Selection{TranslationID: id, DataVersion: tr.DataVersion, BookID: "MAT", Chapter: 1, Spans: []Span{{VerseKey: "1-2", Start: 0, End: utf8.RuneCountInString(text)}}}
	if r := s.CopySelection(sel, "textWithReference", nil, CopyOptions{}); !r.OK || !strings.Contains(desk.text, text) {
		t.Fatal("SWORD copy failed", r.Error)
	}
	if r := s.GetCard(sel, []string{id}, true, CopyOptions{}); !r.OK || r.Data.Lines[0].Text != text {
		t.Fatal("SWORD card failed", r.Error)
	}
	if r := s.SetProjection("MAT1:1", id, DefaultProjectionStyle()); !r.OK || r.Data.Passage.Verses[0].Label != "1-2" {
		t.Fatal("SWORD projection failed", r.Error)
	}
	if r := s.ApplyHighlight("sword-highlight", sel, "green"); !r.OK {
		t.Fatal(r.Error)
	}
	CloseEditionInputs(s)
	if err := lib.Close(); err != nil {
		t.Fatal(err)
	}
	lib, err = editions.Open(filepath.Join(root, "editions.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer lib.Close()
	data, err = bible.Load()
	if err != nil {
		t.Fatal(err)
	}
	s = NewWithEditions(data, store, desk, lib, filepath.Join(root, "imports"))
	defer CloseEditionInputs(s)
	if r := s.GetChapter([]string{id}, "MAT", 1, "restart"); !r.OK || r.Data.Rows[0].Cells[0].Text != text {
		t.Fatal("SWORD lost after restart", r.Error)
	}
	if r := s.ListHighlights([]string{id}, "MAT", 1); !r.OK || len(*r.Data) != 1 {
		t.Fatal("SWORD highlight lost", r.Error)
	}
}
