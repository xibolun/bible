import {
  defaults,
  type API,
  type CardContent,
  type Dataset,
  type Highlight,
  type Preferences,
  type Selection,
} from "./types";
import { codepoints } from "./selection";
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
    const d = await data(),
      b = d.books.find((b) => b.id === sel.bookId)!,
      t = d.translations.find((t) => t.id === sel.translationId)!;
    let content = await text(sel);
    const ref = `${options.uiLanguage === "en" ? b.englishName : b.name} ${sel.chapter}:${sel.spans[0].verseKey}${sel.spans.length > 1 ? "–" + sel.spans.at(-1)!.verseKey : ""}`;
    let editions = t.abbreviation;
    if (mode === "parallelVerse") {
      if (
        ids.length < 2 ||
        new Set(ids).size !== ids.length ||
        !ids.includes(sel.translationId) ||
        ids.some(
          (id) => !d.translations.some((translation) => translation.id === id),
        )
      )
        throw new Error("无效的对照译本或选区");
      content = ids
        .map((id) =>
          d.translations.find((translation) => translation.id === id)!,
        )
        .map(
          (t) =>
            `${t.abbreviation}\n${sel.spans.map((span) => d.chapters[`${t.id}/${sel.bookId}/${sel.chapter}`].find((v) => v.label === span.verseKey)?.text ?? (options.uiLanguage === "en" ? "Verse not present in this translation" : "本译本无此节")).join("\n")}`,
        )
        .join("\n\n");
      editions = ids
        .map(
          (id) =>
            d.translations.find((translation) => translation.id === id)!
              .abbreviation,
        )
        .join(" + ");
    } else if (mode !== "textWithReference")
      throw new Error("INVALID_SELECTION");
    const reference = `${ref} · ${editions}`;
    content =
      options.referencePosition === "before"
        ? `${reference}\n${content}`
        : `${content}\n— ${reference}`;
    await navigator.clipboard.writeText(content);
    return true;
  },
  async GetCard(sel, ids, full) {
    await text(sel);
    const d = await data(),
      b = d.books.find((b) => b.id === sel.bookId)!;
    const out: CardContent = {
      lines: [],
      fileName: `bible-${sel.bookId}-${sel.chapter}-${sel.spans[0].verseKey}`,
      codepoints: 0,
    };
    for (const p of sel.spans) {
      for (const id of ids) {
        const v = d.chapters[`${id}/${sel.bookId}/${sel.chapter}`]?.find(
          (v) => v.label === p.verseKey,
        );
        if (!v) continue;
        const value = full
          ? v.text
          : [...v.text].slice(p.start, p.end).join("");
        out.lines.push({
          text: value,
          reference: `${b.name} ${sel.chapter}:${p.verseKey}`,
          translationId: id,
          version: d.translations.find((t) => t.id === id)!.abbreviation,
        });
        out.codepoints += codepoints(value);
      }
    }
    if (sel.spans.length > 20 || out.codepoints > 4000)
      throw new Error("卡片最多20节、4000个字符");
    return out;
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
