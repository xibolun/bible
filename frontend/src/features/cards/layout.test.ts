import { wrap } from "./layout";
const ctx = {
  measureText: (text: string) => ({ width: [...text].length * 10 }),
} as CanvasRenderingContext2D;
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
