import type { Book, Dataset, FormatOptions } from "../../shared/types";
import type { Passage } from "../../shared/formatting";
import { verseRange } from "../../shared/verse-labels";

export interface ProjectionStyle extends Required<FormatOptions> {
  themeId?: string;
  fontSize: number;
  backgroundColor: string;
  textColor: string;
  alignment: "left" | "center" | "right";
  versesPerPage: number;
}
export interface ProjectionState {
  revision: number;
  reference: string;
  passage: Passage | null;
  passages?: Passage[] | null;
  style: ProjectionStyle;
  pageIndex: number;
  blank: boolean;
}
export const defaultProjectionStyle: ProjectionStyle = {
  themeId: "whiteboard",
  fontSize: 64,
  backgroundColor: "#ffffff",
  textColor: "#18212b",
  alignment: "left",
  versesPerPage: 2,
  referencePosition: "after",
  referenceStyle: "short-version",
  chapterNumerals: "arabic",
  referenceBrackets: "none",
  uiLanguage: "zh-CN",
};
export const emptyProjection = (): ProjectionState => ({
  revision: 0,
  reference: "",
  passage: null,
  passages: [],
  style: { ...defaultProjectionStyle },
  pageIndex: 0,
  blank: false,
});
const normalize = (s: string) =>
  s
    .replace(/[！-～]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase();
export const projectionSearchText = normalize;
export function splitProjectionReferences(reference: string): string[] {
  const refs = reference
    .replace(/\r\n/g, "\n")
    .split(/[;；+＋\n]/)
    .map((r) => r.trim());
  if (new TextEncoder().encode(reference).length > 4096 || refs.length > 12)
    throw new Error("投影最多12段、600节经文，请减少清单后重试");
  if (refs.some((r) => !r)) throw new Error("经文引用不能为空，请检查分隔符");
  return refs;
}
export function resolveReferences(
  data: Dataset,
  reference: string,
  translation: string,
) {
  const passages = splitProjectionReferences(reference).map((r) =>
    resolveReference(data, r, translation),
  );
  if (passages.reduce((n, p) => n + p.verses.length, 0) > 600)
    throw new Error("投影最多12段、600节经文，请减少清单后重试");
  return passages;
}
export const projectionPassages = (s: ProjectionState): Passage[] =>
  s.passages?.length ? s.passages : s.passage ? [s.passage] : [];
export function resolveReference(
  data: Dataset,
  reference: string,
  translationID: string,
): Passage {
  const invalid = () =>
    new Error("书卷、章节或经节范围无效，请输入如 创3:15-16");
  if (new TextEncoder().encode(reference).length > 256) throw invalid();
  const translation = data.translations.find((t) => t.id === translationID);
  if (!translation) throw new Error("请选择已安装的译本");
  const input = normalize(reference);
  let book: Book | undefined,
    suffix = "",
    longest = 0;
  for (const b of data.books) {
    const numericName = b.englishName.replace(
      /^(III|II|I) /,
      (_, roman: string) => ({ I: "1 ", II: "2 ", III: "3 " })[roman]!,
    );
    for (const name of [
      b.id,
      b.name,
      b.abbreviation,
      b.englishName,
      numericName,
    ]) {
      const alias = normalize(name);
      if (alias.length > longest && input.startsWith(alias)) {
        book = b;
        suffix = input.slice(alias.length);
        longest = alias.length;
      }
    }
  }
  const match =
    /^([1-9][0-9]{0,2})(?::([1-9][0-9]{0,2})(?:-([1-9][0-9]{0,2}))?)?$/.exec(
      suffix,
    );
  if (!book || !match || +match[1] > book.chapters) throw invalid();
  const chapter = +match[1];
  let verses = data.chapters[`${translationID}/${book.id}/${chapter}`];
  if (!verses?.length) throw invalid();
  if (match[2]) {
    const first = +match[2],
      last = +(match[3] || match[2]);
    if (last < first) throw invalid();
    const covered = new Set<number>();
    const selected = verses.filter((v) => {
      const span = verseRange(v.label);
      if (!span || !v.text || span[0] > last || span[1] < first) return false;
      for (let n = Math.max(first, span[0]); n <= Math.min(last, span[1]); n++)
        covered.add(n);
      return true;
    });
    for (let n = first; n <= last; n++) if (!covered.has(n)) throw invalid();
    verses = selected;
  }
  return { book, chapter, verses, translation };
}
export const pageCount = (s: ProjectionState) =>
  Math.max(
    1,
    ...projectionPassages(s).map((p) =>
      Math.ceil(p.verses.length / s.style.versesPerPage),
    ),
  );
export function projectionPage(s: ProjectionState) {
  return projectionPages(s)[0] || null;
}
export function projectionPages(s: ProjectionState) {
  return projectionPassages(s)
    .map((passage) => ({
      ...passage,
      verses: passage.verses.slice(
        s.pageIndex * s.style.versesPerPage,
        (s.pageIndex + 1) * s.style.versesPerPage,
      ),
    }))
    .filter((p) => p.verses.length > 0);
}
