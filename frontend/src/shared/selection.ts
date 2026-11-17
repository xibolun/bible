import type { Chapter, Selection, Span } from "./types";

export function codepoints(text: string) {
  return [...text].length;
}
export function graphemeBoundary(
  text: string,
  offset: number,
  direction: "start" | "end",
) {
  const segments = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text);
  const boundaries = [0];
  let n = 0;
  for (const part of segments) {
    n += codepoints(part.segment);
    boundaries.push(n);
  }
  return direction === "start"
    ? Math.max(...boundaries.filter((x) => x <= offset))
    : Math.min(...boundaries.filter((x) => x >= offset));
}
function within(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-verse-text]") ?? null;
}
function pointOffset(root: HTMLElement, node: Node, offset: number) {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, offset);
  return codepoints(r.toString());
}
// DOM marks never contribute reference text: offsets are measured within each text-only cell.
export function captureSelection(
  chapter: Chapter,
  versions: Record<string, string>,
): Selection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const start = within(range.startContainer),
    end = within(range.endContainer);
  if (!start || !end) return null;
  const translationId = start.dataset.translation!;
  if (translationId !== end.dataset.translation)
    throw new Error("MIXED_TRANSLATION");
  if (
    [
      ...range
        .cloneContents()
        .querySelectorAll<HTMLElement>("[data-verse-text]"),
    ].some(
      (element) =>
        element.dataset.translation !== translationId &&
        element.textContent?.length,
    )
  )
    throw new Error("MIXED_TRANSLATION");
  const first = chapter.rows.findIndex((r) => r.label === start.dataset.verse),
    last = chapter.rows.findIndex((r) => r.label === end.dataset.verse);
  if (first < 0 || last < first) throw new Error("INVALID_SELECTION");
  const spans: Span[] = [];
  for (let i = first; i <= last; i++) {
    const row = chapter.rows[i],
      cell = row.cells.find((c) => c.translationId === translationId);
    if (!cell || cell.missing) continue;
    const a =
      i === first
        ? graphemeBoundary(
            cell.text,
            pointOffset(start, range.startContainer, range.startOffset),
            "start",
          )
        : 0;
    const b =
      i === last
        ? graphemeBoundary(
            cell.text,
            pointOffset(end, range.endContainer, range.endOffset),
            "end",
          )
        : codepoints(cell.text);
    if (b > a) spans.push({ verseKey: row.label, start: a, end: b });
  }
  if (!spans.length) return null;
  return {
    translationId,
    dataVersion: versions[translationId],
    bookId: chapter.book.id,
    chapter: chapter.chapter,
    spans,
  };
}
export function wholeVerses(
  chapter: Chapter,
  translationId: string,
  version: string,
  from: string,
  to = from,
): Selection {
  const first = chapter.rows.findIndex((r) => r.label === from),
    last = chapter.rows.findIndex((r) => r.label === to);
  const spans = chapter.rows
    .slice(Math.min(first, last), Math.max(first, last) + 1)
    .flatMap((r) => {
      const c = r.cells.find((x) => x.translationId === translationId);
      return c && !c.missing
        ? [{ verseKey: r.label, start: 0, end: codepoints(c.text) }]
        : [];
    });
  return {
    translationId,
    dataVersion: version,
    bookId: chapter.book.id,
    chapter: chapter.chapter,
    spans,
  };
}
