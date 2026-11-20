import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PassagePicker, rangeEndLabels } from "./PassagePicker";
import type { API, Book, Chapter } from "../../shared/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
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
const books: Book[] = [
  {
    id: "GEN",
    name: "创世记",
    abbreviation: "创",
    englishName: "Genesis",
    chapters: 50,
    testament: "OT",
  },
];
const chapter = (translation: string, label: string): Chapter => ({
  book: books[0],
  chapter: 1,
  clientRequestId: "",
  rows: [
    {
      label,
      cells: [
        {
          translationId: translation,
          verseKey: label,
          text: "verse",
          missing: false,
        },
      ],
    },
  ],
});
it("does not overwrite the latest translation's verse labels with a stale chapter response", async () => {
  let finish!: (value: Chapter) => void;
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Chapter>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(chapter("webp", "2"));
  const api = { GetChapter: get } as unknown as API,
    onAdd = vi.fn();
  const { rerender } = render(
    <PassagePicker
      api={api}
      books={books}
      translation="cuv"
      language="zh-CN"
      onAdd={onAdd}
      disabled={false}
    />,
  );
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "加入投影清单" })).toBeDisabled();
  rerender(
    <PassagePicker
      api={api}
      books={books}
      translation="webp"
      language="zh-CN"
      onAdd={onAdd}
      disabled={false}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "加入投影清单" })).toBeEnabled(),
  );
  await act(async () => {
    finish(chapter("cuv", "1"));
  });
  fireEvent.click(screen.getByRole("button", { name: "加入投影清单" }));
  expect(onAdd).toHaveBeenCalledWith("GEN1:2");
});
it("keeps failed chapter selections unavailable and retries without adding stale scripture", async () => {
  const get = vi
    .fn()
    .mockRejectedValueOnce(new Error("资料读取失败"))
    .mockResolvedValueOnce(chapter("cuv", "1"));
  const onAdd = vi.fn();
  render(
    <PassagePicker
      api={{ GetChapter: get } as unknown as API}
      books={books}
      translation="cuv"
      language="zh-CN"
      onAdd={onAdd}
      disabled={false}
    />,
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "加入投影清单" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "加入投影清单" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "加入投影清单" }));
  expect(onAdd).toHaveBeenCalledWith("GEN1:1");
});
it("restricts end choices to contiguous source labels", () => {
  expect(rangeEndLabels(["1", "2", "4", "5"], "1")).toEqual(["1", "2"]);
  expect(rangeEndLabels(["1", "2", "4", "5"], "4")).toEqual(["4", "5"]);
  expect(rangeEndLabels(["1", "2"], "3")).toEqual([]);
});
