import type { CardContent } from "../../shared/types";
export interface CardStyle {
  height: number;
  background: string;
  color: string;
  fontSize: number;
  align: "left" | "center";
}
export interface PositionedLine {
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
}
function wrapLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = [
    ...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text),
  ].map((s) => s.segment);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(line + word).width <= maxWidth) {
      line += word;
      continue;
    }
    if (line && /^[，。！？；：、）》」』】,.!?;:)]/u.test(word)) {
      let carry =
        [
          ...new Intl.Segmenter(undefined, { granularity: "word" }).segment(
            line,
          ),
        ].at(-1)?.segment ?? "";
      if (!carry.trim() || ctx.measureText(carry + word).width > maxWidth)
        carry =
          [
            ...new Intl.Segmenter(undefined, {
              granularity: "grapheme",
            }).segment(line),
          ].at(-1)?.segment ?? "";
      const head = line.slice(0, line.length - carry.length).trimEnd();
      if (head && ctx.measureText(carry + word).width <= maxWidth) {
        lines.push(head);
        line = carry + word;
        continue;
      }
    }
    if (line.trim()) lines.push(line.trim());
    line = "";
    if (ctx.measureText(word).width <= maxWidth) {
      line = word.trimStart();
      continue;
    }
    for (const { segment } of new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(word)) {
      if (ctx.measureText(line + segment).width > maxWidth && line) {
        lines.push(line);
        line = "";
      }
      line += segment;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
export function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((paragraph) =>
      paragraph ? wrapLine(ctx, paragraph, maxWidth) : [""],
    );
}
export async function drawCard(
  canvas: HTMLCanvasElement,
  content: CardContent,
  style: CardStyle,
) {
  await document.fonts.load('24px "Bible Sans"');
  if (!document.fonts.check('24px "Bible Sans"'))
    throw new Error("离线字体不可用，暂时无法导出。");
  canvas.width = 1080;
  canvas.height = style.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("图片渲染不可用");
  const margin = 100,
    width = 880;
  let size = style.fontSize,
    layout: PositionedLine[] = [],
    total = 0;
  for (; size >= 28; size -= 2) {
    layout = [];
    let y = 0;
    for (const entry of content.lines) {
      const body = { text: entry.text, size },
        reference = { text: entry.reference, size: Math.max(23, size * 0.54) };
      for (const block of entry.referenceBefore
        ? [reference, body]
        : [body, reference]) {
        if (!block.text) continue;
        ctx.font = `${block.size}px "Bible Sans"`;
        for (const text of wrap(ctx, block.text, width)) {
          layout.push({
            text,
            x: style.align === "center" ? 540 : margin,
            y,
            font: ctx.font,
            align: style.align,
          });
          y += block.size * 1.6;
        }
        y += 10;
      }
      y += size * 0.8;
    }
    total = y;
    if (total <= style.height - 2 * margin) break;
  }
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, 1080, style.height);
  if (size < 28)
    throw new Error("文字超出画布，请减少经文、选择竖图或调整字号。");
  const top = Math.max(margin, (style.height - total) / 2);
  ctx.fillStyle = style.color;
  ctx.textBaseline = "top";
  for (const line of layout) {
    ctx.font = line.font;
    ctx.textAlign = line.align;
    ctx.fillText(line.text, line.x, top + line.y);
  }
  return { fontSize: size };
}
