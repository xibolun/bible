import {
  defaults,
  type API,
  type CardContent,
  type Dataset,
  type Highlight,
  type Preferences,
  type Selection,
  type FormatOptions,
} from "./types";
import { codepoints } from "./selection";
import { formatPassage, passageText } from "./formatting";
import { sourceRepository } from "./build";
let loading: Promise<Dataset> | undefined;
function data() {
  return (loading ??= fetch("/dataset.json").then((r) => {
    if (!r.ok) throw new Error("模拟数据不可用");
    return r.json() as Promise<Dataset>;
  }));
}
let highlights: Highlight[] = JSON.parse(
  localStorage.getItem("bible:mock:highlights") ?? "[]",
);
function persist() {
  localStorage.setItem("bible:mock:highlights", JSON.stringify(highlights));
}
async function text(sel: Selection) {
  const d = await data();
  return sel.spans
    .map((p) => {
      const v = d.chapters[
        `${sel.translationId}/${sel.bookId}/${sel.chapter}`
      ]?.find((v) => v.label === p.verseKey);
      if (!v || p.start < 0 || p.end > codepoints(v.text))
        throw new Error("无效选区");
      return [...v.text].slice(p.start, p.end).join("");
    })
    .join("\n");
}
function fail(kind: string) {
  if (new URLSearchParams(location.search).get("mockError") === kind)
    throw new Error(`模拟 ${kind} 操作失败，请重试。`);
}
async function validateIds(ids: string[]) {
  const d = await data();
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !d.translations.some((t) => t.id === id))
  )
    throw new Error("INVALID_TRANSLATION");
}
async function formatted(
  sel: Selection,
  id: string,
  full: boolean,
  options: FormatOptions,
) {
  const d = await data();
  const book = d.books.find((book) => book.id === sel.bookId)!,
    translation = d.translations.find((t) => t.id === id)!;
  const verses = sel.spans.map((span) => {
    const verse = d.chapters[`${id}/${sel.bookId}/${sel.chapter}`]?.find(
      (verse) => verse.label === span.verseKey,
    );
    return {
      label: span.verseKey,
      text: verse
        ? full
          ? verse.text
          : [...verse.text].slice(span.start, span.end).join("")
        : options.uiLanguage === "en"
          ? "Verse not present in this translation"
          : "本译本无此节",
    };
  });
  return formatPassage(
    { book, chapter: sel.chapter, verses, translation },
    options,
  );
}
export const mock: API = {
  async ListTranslations() {
    return (await data()).translations;
  },
  async ListBooks() {
    return (await data()).books;
  },
  async GetChapter(ids, book, chapter, request) {
    fail("data");
    const d = await data(),
      b = d.books.find((x) => x.id === book);
    if (!b || chapter < 1 || chapter > b.chapters) throw new Error("无效章节");
    const labels = [
      ...new Set(
        ids.flatMap((id) =>
          (d.chapters[`${id}/${book}/${chapter}`] ?? []).map((v) => v.label),
        ),
      ),
    ].sort((a, b) => Number(a) - Number(b));
    return {
      book: b,
      chapter,
      clientRequestId: request,
      rows: labels.map((label) => ({
        label,
        cells: ids.map((id) => {
          const v = d.chapters[`${id}/${book}/${chapter}`]?.find(
            (x) => x.label === label,
          );
          return {
            translationId: id,
            verseKey: label,
            text: v?.text ?? "",
            missing: !v,
          };
        }),
      })),
    };
  },
  async GetPreferences() {
    fail("storage");
    return {
      ...defaults,
      ...JSON.parse(
        localStorage.getItem("bible:mock:preferences") ??
          JSON.stringify(defaults),
      ),
    } as Preferences;
  },
  async SavePreferences(p) {
    fail("storage");
    localStorage.setItem("bible:mock:preferences", JSON.stringify(p));
    return true;
  },
  async ListHighlights(ids, book, chapter) {
    fail("storage");
    return highlights.filter(
      (h) =>
        h.bookId === book &&
        h.chapter === chapter &&
        ids.includes(h.translationId),
    );
  },
  async ApplyHighlight(_request, sel, color) {
    fail("storage");
    await text(sel);
    for (const p of sel.spans) {
      const same = (h: Highlight) =>
        h.translationId === sel.translationId &&
        h.dataVersion === sel.dataVersion &&
        h.bookId === sel.bookId &&
        h.chapter === sel.chapter &&
        h.verseKey === p.verseKey;
      const next: Highlight[] = [];
      for (const h of highlights) {
        if (!same(h) || h.end <= p.start || h.start >= p.end) {
          next.push(h);
          continue;
        }
        if (h.start < p.start) next.push({ ...h, end: p.start });
        if (h.end > p.end) next.push({ ...h, start: p.end });
      }
      if (color) next.push({ ...sel, ...p, color });
      highlights = next;
    }
    persist();
    return this.ListHighlights([sel.translationId], sel.bookId, sel.chapter);
  },
  async CopySelection(sel, mode, ids, options) {
    fail("clipboard");
    await text(sel);
    if (mode === "textWithReference") ids = [sel.translationId];
    else if (
      mode !== "parallelVerse" ||
      ids.length < 2 ||
      !ids.includes(sel.translationId)
    )
      throw new Error("INVALID_SELECTION");
    await validateIds(ids);
    const lines = await Promise.all(
      ids.map((id) => formatted(sel, id, mode === "parallelVerse", options)),
    );
    await navigator.clipboard.writeText(lines.map(passageText).join("\n\n"));
    return true;
  },
  async GetCard(sel, ids, full, options) {
    await text(sel);
    await validateIds(ids);
    if (!full && (ids.length !== 1 || ids[0] !== sel.translationId))
      throw new Error("INVALID_SELECTION");
    const lines = await Promise.all(
      ids.map((id) => formatted(sel, id, full, options)),
    );
    const out: CardContent = {
      lines,
      fileName: `bible-${sel.bookId}-${sel.chapter}-${sel.spans[0].verseKey}`,
      codepoints: lines.reduce(
        (sum, line) => sum + codepoints(line.text) + codepoints(line.reference),
        0,
      ),
    };
    if (sel.spans.length > 20 || out.codepoints > 4000)
      throw new Error("卡片最多20节、4000个字符");
    return out;
  },
  async OpenSource() {
    window.open(sourceRepository, "_blank", "noopener,noreferrer");
    return true;
  },
  async SaveCard(encoded, _w, _h, name) {
    fail("export");
    const blob = new Blob(
        [Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))],
        { type: "image/png" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { saved: true, cancelled: false, fileName: a.download };
  },
};
