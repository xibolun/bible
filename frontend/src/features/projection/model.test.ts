import samples from "../../../../testdata/projection-references.json";
import type { Dataset } from "../../shared/types";
import {
  defaultProjectionStyle,
  emptyProjection,
  pageCount,
  projectionPage,
  resolveReference,
  resolveReferences,
  projectionPages,
  splitProjectionReferences,
} from "./model";
import {
  applyProjectionTheme,
  normalizeProjectionTheme,
  projectionThemes,
} from "./themes";

it("combines books in order and pages each source passage without repeating completed passages", () => {
  const passages = resolveReferences(data, "创3:15-16；约一3:1", "cuv");
  const state = {
    ...emptyProjection(),
    passages,
    passage: passages[0],
    style: { ...defaultProjectionStyle, versesPerPage: 1 },
  };
  expect(
    projectionPages(state).map((p) => [p.book.id, p.verses[0].label]),
  ).toEqual([
    ["GEN", "15"],
    ["1JN", "1"],
  ]);
  expect(pageCount(state)).toBe(2);
  expect(
    projectionPages({ ...state, pageIndex: 1 }).map((p) => [
      p.book.id,
      p.verses[0].label,
    ]),
  ).toEqual([["GEN", "16"]]);
  expect(
    projectionPages({ ...state, style: { ...state.style, versesPerPage: 2 } }),
  ).toHaveLength(2);
});
it("validates whole groups and enforces reference and verse bounds", () => {
  expect(splitProjectionReferences("GEN3:15＋1JN3:1\r\nPSA150")).toEqual([
    "GEN3:15",
    "1JN3:1",
    "PSA150",
  ]);
  expect(() => resolveReferences(data, "GEN3:15;1JN99:1", "cuv")).toThrow();
  for (const input of [
    "GEN3:15;",
    ";GEN3:15",
    Array(13).fill("GEN3:15").join(";"),
    "a".repeat(4097),
  ])
    expect(() => splitProjectionReferences(input)).toThrow();
  const large = {
    ...data,
    chapters: {
      ...data.chapters,
      "cuv/PSA/119": Array.from({ length: 176 }, (_, i) => ({
        label: String(i + 1),
        text: "verse",
      })),
    },
  };
  expect(() =>
    resolveReferences(large, Array(4).fill("PSA119").join(";"), "cuv"),
  ).toThrow();
});
it.each(projectionThemes)(
  "applies and retains theme $id while preserving citation and font settings",
  (theme) => {
    const before = {
      ...defaultProjectionStyle,
      fontSize: 100,
      referenceBrackets: "book" as const,
    };
    const styled = applyProjectionTheme(before, theme.id);
    expect(styled).toMatchObject({
      themeId: theme.id,
      fontSize: 100,
      referenceBrackets: "book",
      backgroundColor: theme.backgroundColor,
    });
    expect(normalizeProjectionTheme(styled)).toEqual(styled);
    const luminance = (hex: string) => {
      const components = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return (
        components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722
      );
    };
    const a = luminance(theme.backgroundColor),
      b = luminance(theme.textColor);
    expect(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  },
);
it("infers legacy themes and preserves manual colors and invalid IDs for native validation", () => {
  const legacy = {
    ...defaultProjectionStyle,
    themeId: undefined,
    backgroundColor: "#f4eddc",
    textColor: "#392f24",
  };
  expect(normalizeProjectionTheme(legacy).themeId).toBe("paper");
  expect(
    normalizeProjectionTheme({ ...legacy, backgroundColor: "#123456" }),
  ).toMatchObject({ themeId: "custom", backgroundColor: "#123456" });
  expect(
    normalizeProjectionTheme({ ...legacy, themeId: "unknown" }).themeId,
  ).toBe("unknown");
});

const data = samples.dataset as Dataset;
it.each(samples.valid)("resolves $input to exact original labels", (sample) => {
  const p = resolveReference(data, sample.input, sample.translation);
  expect([
    p.book.id,
    p.chapter,
    p.verses.length,
    p.verses[0].label,
    p.verses.at(-1)!.label,
  ]).toEqual([
    sample.book,
    sample.chapter,
    sample.count,
    sample.first,
    sample.last,
  ]);
});
it.each(samples.invalid)("rejects invalid reference %s", (input) => {
  expect(() => resolveReference(data, input, "cuv")).toThrow();
});
it("rejects missing source labels and unsupported translations without ordinal substitution", () => {
  const incomplete = {
    ...data,
    chapters: {
      "cuv/GEN/3": [
        { label: "15", text: "first" },
        { label: "17", text: "last" },
      ],
    },
  };
  expect(() => resolveReference(incomplete, "GEN3:15-17", "cuv")).toThrow();
  expect(() => resolveReference(data, "GEN3:15", "unknown")).toThrow();
});
it("paginates source verses and keeps projection typography independent", () => {
  const state = {
    ...emptyProjection(),
    passage: resolveReference(data, "PSA150", "cuv"),
    style: { ...defaultProjectionStyle, versesPerPage: 2 },
  };
  expect(pageCount(state)).toBe(3);
  expect(
    projectionPage({ ...state, pageIndex: 2 })?.verses.map((v) => v.label),
  ).toEqual(["5", "6"]);
  expect(pageCount(emptyProjection())).toBe(1);
});
