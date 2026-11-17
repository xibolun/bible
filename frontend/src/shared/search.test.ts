import { describe, expect, it } from "vitest";
import examples from "../../../testdata/scripture-search.json";
import {
  keywordRanges,
  likeMatch,
  likePattern,
  rememberSearch,
  searchScripture,
} from "./search";
import { chineseMeaning } from "../features/word-study/definition";
import type { Dataset, SearchHistoryEntry } from "./types";

describe("LIKE search", () => {
  for (const sample of examples)
    it(`${sample.pattern} in ${sample.text}`, () => {
      expect(likeMatch(sample.text, likePattern(sample.pattern))).toBe(
        sample.match,
      );
    });
  it("rejects empty, oversized and incomplete escape patterns", () => {
    for (const pattern of ["", " ", "test\\", "神".repeat(129)])
      expect(() => likePattern(pattern)).toThrow("INVALID_SEARCH");
  });
  it("paginates deterministically and validates the adapter contract", () => {
    const data: Dataset = {
      translations: [
        {
          id: "cuv",
          name: "CUV",
          language: "zh",
          abbreviation: "CUV",
          dataVersion: "v1",
          license: "test",
          sourceUrl: "",
        },
      ],
      books: [
        {
          id: "GEN",
          name: "创世记",
          englishName: "Genesis",
          abbreviation: "创",
          testament: "OT",
          chapters: 1,
        },
      ],
      chapters: {
        "cuv/GEN/1": [
          { label: "1", text: "起初，神创造天地。" },
          { label: "2", text: "神的灵运行" },
        ],
      },
    };
    expect(searchScripture(data, "cuv", "神", 1, 1)).toMatchObject({
      total: 2,
      results: [{ verseKey: "2" }],
    });
    expect(
      searchScripture(data, "cuv", "起%神", 0, 30).results[0].verseKey,
    ).toBe("1");
    expect(searchScripture(data, "cuv", "none", 0, 30)).toEqual({
      total: 0,
      results: [],
    });
    expect(() => searchScripture(data, "bad", "神", 0, 30)).toThrow(
      "INVALID_TRANSLATION",
    );
    expect(() => searchScripture(data, "cuv", "神", -1, 30)).toThrow(
      "INVALID_SEARCH",
    );
  });
});
it("puts Chinese senses ahead of source metadata while preserving their text", () => {
  const source =
    "3056 logos\n\n欽定本 - word 218\n\n1) 話語\n   1a) 口頭的\n2) 理智";
  expect(chineseMeaning(source)).toBe("1) 話語\n   1a) 口頭的\n2) 理智");
  expect(chineseMeaning("未编号的中文含义")).toBe("未编号的中文含义");
});
it("highlights literal LIKE keywords using Unicode annotation offsets", () => {
  expect(keywordRanges("😀起初，神神", "起%神")).toEqual([
    { start: 1, end: 2 },
    { start: 4, end: 5 },
    { start: 5, end: 6 },
  ]);
  expect(keywordRanges("God GOD", "god")).toEqual([
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
  expect(keywordRanges("10%_", "\\%\\_")).toEqual([{ start: 2, end: 4 }]);
  expect(keywordRanges("任何文字", "%_")).toEqual([]);
});
it("keeps the latest 20 translation-aware unique history entries", () => {
  let history: SearchHistoryEntry[] = [];
  for (let i = 0; i < 25; i++)
    history = rememberSearch(history, {
      translationId: "cuv",
      pattern: `${i}`,
    });
  expect(history).toHaveLength(20);
  expect(history.at(-1)?.pattern).toBe("5");
  history = rememberSearch(history, { translationId: "cuv", pattern: " 10 " });
  expect(history[0].pattern).toBe("10");
  expect(history.filter((entry) => entry.pattern === "10")).toHaveLength(1);
  history = rememberSearch(history, { translationId: "kjv", pattern: "10" });
  expect(history.filter((entry) => entry.pattern === "10")).toHaveLength(2);
  expect(
    rememberSearch([], { translationId: "cuv", pattern: "\\%" })[0].pattern,
  ).toBe("\\%");
  expect(() =>
    rememberSearch(history, { translationId: "cuv", pattern: "bad\\" }),
  ).toThrow("INVALID_SEARCH");
});
