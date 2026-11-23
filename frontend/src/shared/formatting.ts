import type {
  Book,
  Verse,
  Translation,
  FormatOptions,
  ReferenceStyle,
  CardLine,
} from "./types";

export const referenceStyles: {
  value: ReferenceStyle;
  zh: string;
  en: string;
}[] = [
  { value: "full-version", zh: "全书名＋译本", en: "Full name + edition" },
  {
    value: "short-version",
    zh: "书卷简称＋译本",
    en: "Abbreviation + edition",
  },
  { value: "full", zh: "全书名", en: "Full name" },
  { value: "short", zh: "书卷简称", en: "Abbreviation" },
  { value: "inline", zh: "行首整段引用", en: "Inline passage" },
  { value: "verses-short", zh: "逐节简称引用", en: "Per-verse abbreviation" },
  { value: "verses-full", zh: "逐节全名引用", en: "Per-verse full name" },
];
export const inlineReferences = (style: ReferenceStyle) =>
  style === "inline" || style.startsWith("verses-");
export const chapterNumeralOptions = [
  { value: "arabic", zh: "阿拉伯数字（3）", en: "Arabic numerals (3)" },
  { value: "chinese", zh: "中文数字（三）", en: "Chinese numerals (三)" },
];
export const referenceBracketOptions = [
  { value: "none", zh: "无", en: "None" },
  { value: "book", zh: "【】", en: "【】" },
  { value: "corner", zh: "「」", en: "「」" },
  { value: "square", zh: "[]", en: "[]" },
];
export function chineseChapter(value: number): string {
  const digits = "零一二三四五六七八九";
  if (value < 10) return digits[value];
  if (value < 20) return `十${value % 10 ? digits[value % 10] : ""}`;
  if (value < 100)
    return `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ""}`;
  const rest = value % 100;
  return `${digits[Math.floor(value / 100)]}百${rest ? `${rest < 10 ? "零" : rest < 20 ? "一" : ""}${chineseChapter(rest)}` : ""}`;
}
const brackets = {
  none: ["", ""],
  book: ["【", "】"],
  corner: ["「", "」"],
  square: ["[", "]"],
};
export interface Passage {
  book: Book;
  chapter: number;
  verses: Verse[];
  translation: Translation;
}

export function formatPassage(
  passage: Passage,
  options: FormatOptions,
): CardLine {
  const numerals = options.chapterNumerals || "arabic";
  const bracketStyle = options.referenceBrackets || "none";
  if (
    !referenceStyles.some((style) => style.value === options.referenceStyle) ||
    !["before", "after"].includes(options.referencePosition) ||
    !["zh-CN", "en"].includes(options.uiLanguage) ||
    !chapterNumeralOptions.some((choice) => choice.value === numerals) ||
    !referenceBracketOptions.some((choice) => choice.value === bracketStyle)
  )
    throw new Error("INVALID_SETTINGS");
  const { book, chapter, verses, translation } = passage;
  const chapterText =
    numerals === "chinese" ? chineseChapter(chapter) : String(chapter);
  const chapterSeparator = numerals === "chinese" ? "" : ":";
  const [left, right] = brackets[bracketStyle];
  const wrap = (reference: string) => `${left}${reference}${right}`;
  if (!verses.length) throw new Error("INVALID_SELECTION");
  const short = ["short-version", "short", "inline", "verses-short"].includes(
    options.referenceStyle,
  );
  const name =
    options.uiLanguage === "en"
      ? short
        ? book.id
        : book.englishName
      : short
        ? book.abbreviation
        : book.name;
  const ref = (label: string) =>
    `${name}${options.uiLanguage === "en" ? " " : ""}${chapterText}${chapterSeparator}${label}`;
  const perVerse = options.referenceStyle.startsWith("verses-");
  const line: CardLine = {
    text: verses
      .map((verse) =>
        perVerse ? `${wrap(ref(verse.label))}: ${verse.text}` : verse.text,
      )
      .join("\n"),
    reference: "",
    referenceBefore: false,
    translationId: translation.id,
    version: translation.abbreviation,
  };
  if (perVerse) return line;
  const label =
    verses[0].label +
    (verses.at(-1)!.label === verses[0].label
      ? ""
      : (options.referenceStyle === "inline" ? "-" : "–") +
        verses.at(-1)!.label);
  let reference = ref(label);
  if (options.referenceStyle === "inline") {
    line.text = `${wrap(reference)}: ${line.text}`;
    return line;
  }
  if (options.referenceStyle.endsWith("-version"))
    reference += `·${translation.abbreviation}`;
  reference = wrap(reference);
  line.referenceBefore = options.referencePosition === "before";
  line.reference = line.referenceBefore ? reference : `— ${reference}`;
  return line;
}

export function passageText(line: CardLine) {
  return !line.reference
    ? line.text
    : line.referenceBefore
      ? `${line.reference}\n${line.text}`
      : `${line.text}\n${line.reference}`;
}
