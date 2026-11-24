package service

import (
	"context"
	"crypto/rand"
	"os"
	"time"

	"github.com/xibolun/bible/internal/catalogue"
	"github.com/xibolun/bible/internal/importer"
)

func (s *Service) ListCrossWireEditions() Result[[]catalogue.Module] {
	m := s.editions
	if m == nil {
		return failure[[]catalogue.Module]("EDITION_LIBRARY_UNAVAILABLE")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	modules, err := m.source.List(ctx)
	if err != nil {
		return importFailure[[]catalogue.Module](err)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closing {
		return failure[[]catalogue.Module]("BRIDGE_UNAVAILABLE")
	}
	m.modules = map[string]catalogue.Module{}
	for _, module := range modules {
		m.modules[module.ID] = module
	}
	return success(modules)
}

func (s *Service) DownloadCrossWireEdition(id string) Result[EditionImportJob] {
	m := s.editions
	if m == nil || m.library == nil {
		return failure[EditionImportJob]("EDITION_LIBRARY_UNAVAILABLE")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closing || m.choosing || m.job != nil && (m.job.view.Status == "downloading" || m.job.view.Status == "inspecting" || m.job.view.Status == "committing") {
		return failure[EditionImportJob]("IMPORT_BUSY")
	}
	module, ok := m.modules[id]
	if !ok {
		return failure[EditionImportJob]("SOURCE_REFRESH_REQUIRED")
	}
	if !module.Supported {
		return failure[EditionImportJob]("FORMAT_UNSUPPORTED")
	}
	if err := os.MkdirAll(m.root, 0700); err != nil {
		return failure[EditionImportJob]("IMPORT_IO")
	}
	out, err := os.CreateTemp(m.root, "download-*")
	if err != nil {
		return failure[EditionImportJob]("IMPORT_IO")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	j := &importJob{view: EditionImportJob{ID: rand.Text(), Status: "downloading", Samples: []importer.Record{}}, expires: time.Now().Add(30 * time.Minute), cancel: cancel, filename: out.Name(), name: id + ".zip"}
	if err := saveImportJob(m, j); err != nil {
		cancel()
		out.Close()
		os.Remove(out.Name())
		return failure[EditionImportJob]("IMPORT_IO")
	}
	if m.job != nil {
		m.job.cancel()
		if m.job.filename != "" {
			_ = os.Remove(m.job.filename)
		}
		m.job.draft = nil
		m.job.view.Report = nil
	}
	m.job = j
	m.workers.Add(1)
	go func() {
		defer m.workers.Done()
		defer cancel()
		defer os.Remove(out.Name())
		err := m.source.Download(ctx, id, out, func(done, total int64) {
			m.mu.Lock()
			defer m.mu.Unlock()
			if j.view.Status == "downloading" {
				j.view.DownloadedBytes = done
				j.view.TotalBytes = total
			}
		})
		closeErr := out.Close()
		if err == nil {
			err = closeErr
		}
		var draft *importer.Draft
		if err == nil {
			m.mu.Lock()
			if j.view.Status == "cancelled" {
				m.mu.Unlock()
				return
			}
			j.view.Status = "inspecting"
			_ = saveImportJob(m, j)
			m.mu.Unlock()
			draft, err = importer.Parse(ctx, out.Name(), j.name, s.Data)
			if err == nil && (draft.Format != "sword" || draft.Abbreviation != id || draft.Language != module.Language || draft.SourceEdition != module.Version) {
				err = &importer.Problem{Code: "SOURCE_CHANGED", Position: id}
			}
			if err == nil {
				draft.Metadata["DownloadRepository"] = "CrossWire"
				draft.Metadata["DownloadURL"] = catalogue.ZIPBase + id + ".zip"
			}
		}
		_ = os.Remove(out.Name())
		m.mu.Lock()
		defer m.mu.Unlock()
		j.filename = ""
		if j.view.Status == "cancelled" {
			return
		}
		if err != nil {
			code, pos := importer.Describe(err)
			j.view.Status = "failed"
			j.view.Problem = &EditionImportProblem{Code: code, Position: pos}
		} else {
			j.draft = draft
			j.view.Report = draft
			j.view.Status = "ready"
			for _, r := range draft.Records {
				if r.Text != "" {
					j.view.Samples = append(j.view.Samples, r)
				}
				if len(j.view.Samples) == 5 {
					break
				}
			}
		}
		if err := saveImportJob(m, j); err != nil {
			j.draft = nil
			j.view.Report = nil
			j.view.Status = "failed"
			j.view.Problem = &EditionImportProblem{Code: "IMPORT_IO"}
		}
	}()
	return success(publicJob(j))
}
