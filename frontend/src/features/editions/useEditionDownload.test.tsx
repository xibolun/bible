import { act, cleanup, renderHook } from "@testing-library/react";
import { useEditionDownload } from "./useEditionDownload";
import type {
  DownloadEdition,
  EditionAPI,
  EditionInstall,
  EditionJob,
} from "./types";

afterEach(cleanup);
const module = {
  id: "SYN",
  name: "Synthetic",
  version: "2",
} as DownloadEdition;
const ready = {
  id: "job",
  status: "ready",
  samples: [],
  report: { name: "Source name", abbreviation: "SYN", language: "en" },
} as unknown as EditionJob;
function setup() {
  const api = {
    DownloadCrossWireEdition: vi.fn().mockResolvedValue(ready),
    CommitEditionImport: vi
      .fn()
      .mockResolvedValue({
        id: "job",
        status: "done",
        samples: [],
        installed: { id: "user:one" },
      }),
    CancelEditionImport: vi
      .fn()
      .mockResolvedValue({ id: "job", status: "cancelled", samples: [] }),
  } as unknown as EditionAPI;
  const installed = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useEditionDownload(api, installed));
  return { api, installed, ...hook };
}
it("installs a click-selected download once and keeps update identity and display metadata", async () => {
  const { api, installed, result } = setup();
  const target = {
    translation: {
      id: "user:one",
      name: "My name",
      abbreviation: "MINE",
      language: "zh",
    },
  } as EditionInstall;
  await act(async () => {
    await Promise.all([
      result.current.start(module, target),
      result.current.start(module, target),
    ]);
  });
  expect(api.DownloadCrossWireEdition).toHaveBeenCalledTimes(1);
  expect(api.CommitEditionImport).toHaveBeenCalledExactlyOnceWith("job", {
    name: "My name",
    abbreviation: "MINE",
    language: "zh",
    replaceId: "user:one",
  });
  expect(installed).toHaveBeenCalledTimes(1);
  expect(result.current.task).toBeUndefined();
});
it("cancellation before the download RPC returns cannot auto-install its later ready response", async () => {
  const { api, result } = setup();
  let finish!: (job: EditionJob) => void;
  vi.mocked(api.DownloadCrossWireEdition).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.start(module);
  });
  await act(async () => {
    await result.current.cancel();
    finish(ready);
    await pending;
  });
  expect(api.CommitEditionImport).not.toHaveBeenCalled();
  expect(api.CancelEditionImport).toHaveBeenCalledWith("job");
});
it("closing management before a late ready response prevents automatic installation", async () => {
  const { api, result, unmount } = setup();
  let finish!: (job: EditionJob) => void;
  vi.mocked(api.DownloadCrossWireEdition).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.start(module);
  });
  unmount();
  finish(ready);
  await pending;
  expect(api.CommitEditionImport).not.toHaveBeenCalled();
  expect(api.CancelEditionImport).toHaveBeenCalledWith("job");
});
it("keeps a failed install retryable and never reports it as installed", async () => {
  const { api, result, installed } = setup();
  vi.mocked(api.CommitEditionImport).mockRejectedValueOnce(
    new Error("IMPORT_IO"),
  );
  await act(async () => {
    await result.current.start(module);
  });
  expect(result.current.task?.phase).toBe("failed");
  expect(installed).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.start(module);
  });
  expect(installed).toHaveBeenCalledTimes(1);
});
