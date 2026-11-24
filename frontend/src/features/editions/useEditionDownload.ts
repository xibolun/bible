import { useEffect, useRef, useState } from "react";
import type {
  EditionAPI,
  DownloadEdition,
  EditionInstall,
  EditionJob,
} from "./types";

export interface DownloadTask {
  module: DownloadEdition;
  target?: EditionInstall;
  phase: "starting" | "downloading" | "inspecting" | "committing" | "failed";
  job?: EditionJob;
  error?: unknown;
}

export function useEditionDownload(
  api: EditionAPI,
  onInstalled: () => Promise<void>,
) {
  const [task, setTask] = useState<DownloadTask>();
  const mounted = useRef(true);
  const current = useRef<
    { cancelled: boolean; committing?: boolean; job?: EditionJob } | undefined
  >(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (current.current) {
        current.current.cancelled = true;
        if (current.current.job)
          void api.CancelEditionImport(current.current.job.id).catch(() => {});
      }
    };
  }, [api]);
  const start = async (module: DownloadEdition, target?: EditionInstall) => {
    if (current.current) return;
    const run: { cancelled: boolean; committing?: boolean; job?: EditionJob } =
      { cancelled: false };
    current.current = run;
    const update = (phase: DownloadTask["phase"], error?: unknown) => {
      if (mounted.current)
        setTask({ module, target, phase, job: run.job, error });
    };
    update("starting");
    try {
      run.job = await api.DownloadCrossWireEdition(module.id);
      while (!run.cancelled && mounted.current) {
        const job = run.job;
        if (job.status === "ready") {
          if (!job.report) throw new Error("INVALID_CONTENT");
          run.committing = true;
          update("committing");
          const report = job.report;
          run.job = await api.CommitEditionImport(job.id, {
            name: target?.translation.name || report.name,
            abbreviation:
              target?.translation.abbreviation || report.abbreviation,
            language: target?.translation.language || report.language,
            replaceId: target?.translation.id || "",
          });
          if (run.job.status !== "done") throw new Error("IMPORT_IO");
          if (mounted.current) {
            await onInstalled();
            if (mounted.current) setTask(undefined);
          }
          return;
        }
        if (job.status === "failed")
          throw {
            code: job.problem?.code || "IMPORT_IO",
            position: job.problem?.position,
          };
        if (job.status === "cancelled") {
          run.cancelled = true;
          break;
        }
        update(job.status === "downloading" ? "downloading" : "inspecting");
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (!run.cancelled && mounted.current)
          run.job = await api.GetEditionImportJob(job.id);
      }
      if (run.job) await api.CancelEditionImport(run.job.id);
      if (mounted.current) setTask(undefined);
    } catch (error) {
      if (run.job && !run.committing)
        await api.CancelEditionImport(run.job.id).catch(() => {});
      if (!run.cancelled) update("failed", error);
      else if (mounted.current) setTask(undefined);
    } finally {
      if (current.current === run) current.current = undefined;
    }
  };
  const cancel = async () => {
    const run = current.current;
    if (!run || run.committing) return;
    run.cancelled = true;
    if (run.job) await api.CancelEditionImport(run.job.id).catch(() => {});
  };
  return { task, start, cancel, busy: !!task && task.phase !== "failed" };
}
