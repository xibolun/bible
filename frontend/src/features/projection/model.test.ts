import samples from "../../../../testdata/projection-references.json";
import type { Dataset } from "../../shared/types";
import {
  defaultProjectionStyle,
  emptyProjection,
  pageCount,
  projectionPage,
  resolveReference,
} from "./model";

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
