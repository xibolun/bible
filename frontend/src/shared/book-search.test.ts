import {
  bookPinyin,
  matchesBookSearch,
  normalizeBookSearch,
} from "./book-search";
import type { Book } from "./types";

const john: Book = {
  id: "JHN",
  name: "约翰福音",
  abbreviation: "约",
  englishName: "John",
  testament: "NT",
  chapters: 21,
};
const firstJohn: Book = {
  ...john,
  id: "1JN",
  name: "约翰一书",
  abbreviation: "约一",
  englishName: "I John",
  chapters: 5,
};
const genesis: Book = {
  id: "GEN",
  name: "创世记",
  abbreviation: "创",
  englishName: "Genesis",
  testament: "OT",
  chapters: 50,
};
it.each([
  "John",
  "JOHN",
  "Ｊｏｈｎ",
  "JHN",
  "约翰",
  "约",
  "yuehan",
  "YUE HAN FU YIN",
  "yuē hàn fú yīn",
  "yue-han",
  "yue'han",
  "yhfy",
  "ＹＨＦＹ",
])("matches John using %s", (query) => {
  expect(matchesBookSearch(john, query)).toBe(true);
});
it.each([
  "1 John",
  "I John",
  "１ Ｊｏｈｎ",
  "1JN",
  "yuehanyishu",
  "yhys",
  "yueyi",
  "yy",
])("matches the numbered book using %s", (query) => {
  expect(matchesBookSearch(firstJohn, query)).toBe(true);
  expect(matchesBookSearch(john, query)).toBe(false);
});
it("supports full and abbreviated Pinyin while keeping aliases separate", () => {
  expect(matchesBookSearch(genesis, "chuangshiji")).toBe(true);
  expect(matchesBookSearch(genesis, "csj")).toBe(true);
  expect(matchesBookSearch(genesis, "chuang")).toBe(true);
  expect(matchesBookSearch(genesis, "genchuang")).toBe(false);
  expect(matchesBookSearch(john, "yuehanjohn")).toBe(false);
  expect(matchesBookSearch(john, "not a book")).toBe(false);
  expect(matchesBookSearch(genesis, "")).toBe(true);
});
it("covers exactly the installed 66-book canon with valid explicit syllables", () => {
  const ids =
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split(
      " ",
    );
  expect(Object.keys(bookPinyin).sort()).toEqual(ids.sort());
  for (const aliases of Object.values(bookPinyin))
    for (const alias of aliases) expect(alias).toMatch(/^[a-z]+(?: [a-z]+)*$/);
  expect(bookPinyin.ACT[0]).toBe("shi tu xing zhuan");
});
it("normalizes tones, case and separators without losing numbered-book digits", () => {
  expect(normalizeBookSearch("Ｙｕē Hàn-fú'yīn")).toBe("yuehanfuyin");
  expect(normalizeBookSearch("１ Ｊｏｈｎ")).toBe("1john");
  expect(matchesBookSearch({ ...john, id: "unknown" }, "John")).toBe(true);
});
