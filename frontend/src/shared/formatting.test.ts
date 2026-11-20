import fixture from "../../../testdata/passage-formats.json" with { type: "json" };
import {
  chineseChapter,
  formatPassage,
  passageText,
  type Passage,
} from "./formatting";
import type { FormatOptions, ReferenceStyle } from "./types";
import referenceOptions from "../../../testdata/reference-options.json";

it.each(fixture.cases)(
  "matches the user's $style example for copy and cards",
  ({ style, expected }) => {
    const line = formatPassage(fixture as Passage, {
      referenceStyle: style as ReferenceStyle,
      referencePosition: "after",
      uiLanguage: "zh-CN",
    });
    expect(passageText(line)).toBe(expected);
    if (!style.endsWith("-version"))
      expect(line.reference).not.toContain("CUV");
  },
);
it("formats a single verse, English abbreviation and explicit position", () => {
  const passage = { ...fixture, verses: fixture.verses.slice(0, 1) } as Passage;
  const line = formatPassage(passage, {
    referenceStyle: "short-version",
    referencePosition: "before",
    uiLanguage: "en",
  });
  expect(passageText(line)).toBe(`ECC 1:6·CUV\n${fixture.verses[0].text}`);
});
it.each(referenceOptions.chapterCases)(
  "formats Chinese chapter %s",
  (value, expected) => {
    expect(chineseChapter(Number(value))).toBe(expected);
  },
);
it.each(referenceOptions.cases)(
  "formats reference options: $name",
  (sample) => {
    const passage = {
      ...referenceOptions,
      verses: sample.single
        ? referenceOptions.verses.slice(0, 1)
        : referenceOptions.verses,
    } as Passage;
    expect(
      passageText(formatPassage(passage, sample.options as FormatOptions)),
    ).toBe(sample.expected);
  },
);
it("rejects unknown chapter and bracket formats", () => {
  for (const options of [
    { chapterNumerals: "roman" },
    { referenceBrackets: "angle" },
  ])
    expect(() =>
      formatPassage(
        fixture as Passage,
        {
          referenceStyle: "short",
          referencePosition: "before",
          uiLanguage: "zh-CN",
          ...options,
        } as FormatOptions,
      ),
    ).toThrow("INVALID_SETTINGS");
});
