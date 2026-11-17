import { wrap } from "./layout";
const ctx = {
  measureText: (text: string) => ({ width: [...text].length * 10 }),
} as CanvasRenderingContext2D;
it("retains explicit verse and prefix line breaks", () => {
  expect(wrap(ctx, "传1:6: 风往南刮。\n传1:7: 江河都往海里流。", 1000)).toEqual(
    ["传1:6: 风往南刮。", "传1:7: 江河都往海里流。"],
  );
});
it("keeps closing punctuation with the preceding word at a wrap boundary", () => {
  const text = "风往南刮，江河流。";
  const lines = wrap(ctx, text, 40);
  expect(lines.join("")).toBe(text);
  expect(
    lines.every(
      (line) => !/^[，。]/u.test(line) && ctx.measureText(line).width <= 40,
    ),
  ).toBe(true);
});
it("wraps Chinese without losing characters", () => {
  expect(wrap(ctx, "起初神创造天地", 30).join("")).toBe("起初神创造天地");
  expect(wrap(ctx, "起初神创造天地", 30)).toHaveLength(3);
});
it("splits long English words safely and retains punctuation", () => {
  const text = "abcdefghijk. 😀é";
  const lines = wrap(ctx, text, 40);
  expect(lines.join("").replaceAll(" ", "")).toBe(text.replaceAll(" ", ""));
  expect(lines.every((l) => [...l].length <= 4)).toBe(true);
  expect(lines.join("")).toContain("é");
});
