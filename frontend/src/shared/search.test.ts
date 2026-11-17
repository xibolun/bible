import { describe, expect, it } from "vitest";
import examples from "../../../testdata/scripture-search.json";
import { likeMatch, likePattern, searchScripture } from "./search";
import { chineseMeaning } from "../features/word-study/definition";
import type { Dataset } from "./types";

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
