import {
  captureSelection,
  codepoints,
  graphemeBoundary,
  wholeVerses,
} from "./selection";
import type { Chapter } from "./types";

const chapter: Chapter = {
  book: {
    id: "GEN",
    name: "创世记",
    abbreviation: "创",
    englishName: "Genesis",
    testament: "OT",
    chapters: 50,
  },
  chapter: 1,
  clientRequestId: "test",
  rows: [
    {
      label: "1",
      cells: [
        {
          translationId: "cuv",
          verseKey: "1",
          text: "A😀é中B",
          missing: false,
        },
        {
          translationId: "webp",
          verseKey: "1",
          text: "English.",
          missing: false,
        },
      ],
    },
    {
      label: "2",
      cells: [
        { translationId: "cuv", verseKey: "2", text: "第二节", missing: false },
      ],
    },
  ],
};
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});
it("uses Unicode code points and protects combining characters", () => {
  expect(codepoints("A😀é中B")).toBe(6);
  expect(graphemeBoundary("A😀é中B", 3, "start")).toBe(2);
  expect(graphemeBoundary("A😀é中B", 3, "end")).toBe(4);
});
it("measures through highlight spans without including verse buttons", () => {
  document.body.innerHTML =
    '<div><button>1</button><span data-verse-text data-translation="cuv" data-verse="1">A<mark>😀é</mark>中B</span></div>';
  const mark = document.querySelector("mark")!.firstChild!,
    tail = document.querySelector("[data-verse-text]")!.lastChild!;
  const r = document.createRange();
  r.setStart(mark, 0);
  r.setEnd(tail, 1);
  window.getSelection()!.addRange(r);
  expect(captureSelection(chapter, { cuv: "v1" })).toMatchObject({
    translationId: "cuv",
    spans: [{ verseKey: "1", start: 1, end: 5 }],
  });
});
it("rejects a selection crossing translations", () => {
  document.body.innerHTML =
    '<span data-verse-text data-translation="cuv" data-verse="1">中文</span><span data-verse-text data-translation="webp" data-verse="1">English</span>';
  const els = document.querySelectorAll("span"),
    r = document.createRange();
  r.setStart(els[0].firstChild!, 0);
  r.setEnd(els[1].firstChild!, 3);
  window.getSelection()!.addRange(r);
  expect(() => captureSelection(chapter, { cuv: "v1", webp: "v1" })).toThrow(
    "MIXED_TRANSLATION",
  );
});
it("rejects an interleaved translation even when both endpoints use CUV", () => {
  document.body.innerHTML =
    '<span data-verse-text data-translation="cuv" data-verse="1">A😀é中B</span><span data-verse-text data-translation="webp" data-verse="1">English.</span><span data-verse-text data-translation="cuv" data-verse="2">第二节</span>';
  const cells = document.querySelectorAll("span");
  const range = document.createRange();
  range.setStart(cells[0].firstChild!, 0);
  range.setEnd(cells[2].firstChild!, 3);
  window.getSelection()!.addRange(range);
  expect(() => captureSelection(chapter, { cuv: "v1" })).toThrow(
    "MIXED_TRANSLATION",
  );
});
it("builds a contiguous full-verse keyboard range in either direction", () => {
  const s = wholeVerses(chapter, "cuv", "v1", "2", "1");
  expect(s.spans).toEqual([
    { verseKey: "1", start: 0, end: 6 },
    { verseKey: "2", start: 0, end: 3 },
  ]);
});
