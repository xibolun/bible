import type { Book } from "../../shared/types";
import {
  entryBook,
  entryNumber,
  quickEntryAction,
  quickReference,
  seedQuickEntry,
} from "./quick-entry";
const book: Book = {
  id: "JHN",
  name: "约翰福音",
  abbreviation: "约",
  englishName: "John",
  chapters: 21,
  testament: "NT",
};
it("creates exact single, range and whole-chapter references", () => {
  expect(quickReference(book, "３", "１６", undefined, ["15", "16"])).toBe(
    "JHN3:16",
  );
  expect(quickReference(book, "3", "15", "16", ["15", "16"])).toBe(
    "JHN3:15-16",
  );
  expect(quickReference(book, "3", "16", "16", ["16"])).toBe("JHN3:16");
  expect(quickReference(book, "3", "", undefined, ["1"])).toBe("JHN3");
});
it.each([
  ["22", "1", undefined],
  ["0", "1", undefined],
  ["3", "2", undefined],
  ["3", "16", "15"],
  ["3", "15", ""],
  ["3", "15", "17"],
  ["3", "abc", undefined],
])("rejects invalid chapter/verse fields %s %s %s", (chapter, start, end) => {
  expect(() =>
    quickReference(book, chapter!, start!, end, ["15", "17"]),
  ).toThrow("INVALID_REFERENCE");
});
it("resolves Pinyin/English books and canonical numbers", () => {
  expect(entryBook([book], "yuehan")?.id).toBe("JHN");
  expect(entryBook([book], "JOHN")?.id).toBe("JHN");
  expect(entryBook([book], "")).toBeUndefined();
  expect(entryNumber("０３")).toBe(3);
  expect(entryNumber("0")).toBeUndefined();
  expect(seedQuickEntry([book], "JHN3:15-16")).toMatchObject({
    bookID: "JHN",
    chapter: 3,
    start: "15",
    end: "16",
    range: true,
  });
});
const key = {
  key: "Enter",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
};
it("scopes the Add command to Control or Meta Enter and ignores composition/repeats", () => {
  expect(quickEntryAction(key)).toBe("confirm");
  expect(quickEntryAction({ ...key, ctrlKey: true })).toBe("add");
  expect(quickEntryAction({ ...key, metaKey: true })).toBe("add");
  expect(quickEntryAction({ ...key, key: "Tab" })).toBe("next");
  for (const patch of [
    { isComposing: true },
    { repeat: true },
    { altKey: true },
    { shiftKey: true },
    { ctrlKey: true, metaKey: true },
    { key: "Tab", shiftKey: true },
  ])
    expect(quickEntryAction({ ...key, ...patch })).toBeUndefined();
});
