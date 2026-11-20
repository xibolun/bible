import type { Book, Dataset, FormatOptions } from "../../shared/types";
import type { Passage } from "../../shared/formatting";

export interface ProjectionStyle extends Required<FormatOptions> {
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
  style: ProjectionStyle;
  pageIndex: number;
  blank: boolean;
}
export const defaultProjectionStyle: ProjectionStyle = {
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
    const selected = [];
    for (let n = first; n <= last; n++) {
      const verse = verses.find((v) => v.label === String(n));
      if (!verse) throw invalid();
      selected.push(verse);
    }
    verses = selected;
  }
  return { book, chapter, verses, translation };
}
export const pageCount = (s: ProjectionState) =>
  Math.max(
    1,
    Math.ceil((s.passage?.verses.length || 0) / s.style.versesPerPage),
  );
export function projectionPage(s: ProjectionState) {
  return (
    s.passage && {
      ...s.passage,
      verses: s.passage.verses.slice(
        s.pageIndex * s.style.versesPerPage,
        (s.pageIndex + 1) * s.style.versesPerPage,
      ),
    }
  );
}
