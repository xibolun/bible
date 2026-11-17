import { describe, expect, it } from "vitest";
import { palettes } from "./themes";

function luminance(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
describe("reading palette legibility", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    it(`${name} keeps scripture and secondary text readable on all reading surfaces`, () => {
      for (const surface of [palette.page, palette.surface, palette.raised]) {
        expect(contrast(palette.text, surface)).toBeGreaterThanOrEqual(7);
        expect(contrast(palette.secondary, surface)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
  }
});
