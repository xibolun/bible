import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { EditionCatalogue } from "./EditionCatalogue";
import type { API, Translation } from "../../shared/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  const style = window.getComputedStyle.bind(window);
  // JSDOM cannot measure scrollbar pseudo-elements; layout is covered in Chromium.
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    style(element),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

it("requests the catalogue only after More editions, including after local refresh and reopening", async () => {
  const list = vi.fn().mockResolvedValue([
    {
      id: "SYN",
      name: "Remote synthetic",
      language: "en",
      version: "1",
      supported: true,
      license: "CC0",
      about: "",
      size: 1,
      reason: "",
    },
  ]);
  const reload = vi.fn().mockResolvedValue(undefined);
  const props = {
    api: { ListCrossWireEditions: list } as unknown as API,
    language: "zh-CN" as "zh-CN" | "en",
    translations: [
      {
        id: "cuv",
        name: "Local CUV",
        abbreviation: "CUV",
        language: "zh-Hans",
      },
    ] as Translation[],
    installs: [],
    loading: false,
    disabled: false,
    onImport: vi.fn(),
    onReload: reload,
    onInstalled: vi.fn(),
    onRead: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onRestore: vi.fn(),
  };
  const view = render(<EditionCatalogue {...props} />);
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "刷新列表" }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "更多译本" }));
  await screen.findByText("SYN · Remote synthetic");
  expect(list).toHaveBeenCalledTimes(1);
  view.rerender(<EditionCatalogue {...props} language="en" />);
  expect(list).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  view.unmount();
  render(<EditionCatalogue {...props} />);
  expect(screen.getByRole("button", { name: "更多译本" })).toBeVisible();
  expect(screen.queryByText("SYN · Remote synthetic")).toBeNull();
  expect(list).toHaveBeenCalledTimes(2);
});
