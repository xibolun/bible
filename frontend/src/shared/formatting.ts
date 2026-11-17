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
  if (
    !referenceStyles.some((style) => style.value === options.referenceStyle) ||
    !["before", "after"].includes(options.referencePosition) ||
    !["zh-CN", "en"].includes(options.uiLanguage)
  )
    throw new Error("INVALID_SETTINGS");
  const { book, chapter, verses, translation } = passage;
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
    `${name}${options.uiLanguage === "en" ? " " : ""}${chapter}:${label}`;
  const perVerse = options.referenceStyle.startsWith("verses-");
  const line: CardLine = {
    text: verses
      .map((verse) =>
        perVerse ? `${ref(verse.label)}: ${verse.text}` : verse.text,
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
    line.text = `${reference}: ${line.text}`;
    return line;
  }
  if (options.referenceStyle.endsWith("-version"))
    reference += `·${translation.abbreviation}`;
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
