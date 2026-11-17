import fixture from "../../../testdata/passage-formats.json" with { type: "json" };
import { formatPassage, passageText, type Passage } from "./formatting";
import type { ReferenceStyle } from "./types";

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
