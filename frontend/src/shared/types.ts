export interface Translation {
  id: string;
  name: string;
  language: string;
  abbreviation: string;
  dataVersion: string;
  sourceUrl: string;
  license: string;
}
export interface Book {
  id: string;
  name: string;
  abbreviation: string;
  englishName: string;
  testament: string;
  chapters: number;
}
export interface Verse {
  label: string;
  text: string;
}
export interface Cell {
  translationId: string;
  verseKey: string;
  text: string;
  missing: boolean;
}
export interface Row {
  label: string;
  cells: Cell[];
}
export interface Chapter {
  book: Book;
  chapter: number;
  rows: Row[];
  clientRequestId: string;
}
export interface Span {
  verseKey: string;
  start: number;
  end: number;
}
export interface Selection {
  translationId: string;
  dataVersion: string;
  bookId: string;
  chapter: number;
  spans: Span[];
}
export interface Highlight {
  translationId: string;
  dataVersion: string;
  bookId: string;
  chapter: number;
  verseKey: string;
  start: number;
  end: number;
  color: string;
}
export interface Preferences {
  bookId: string;
  chapter: number;
  topVerse: string;
  scrollOffset: number;
  translations: string[];
  parallel: boolean;
  fontSize: number;
  referencePosition: "before" | "after";
  uiLanguage: "zh-CN" | "en";
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
  maximized: boolean;
  schemaVersion: number;
}
export interface CardLine {
  text: string;
  reference: string;
  translationId: string;
  version: string;
}
export interface CardContent {
  lines: CardLine[];
  fileName: string;
  codepoints: number;
}
export interface Saved {
  saved: boolean;
  cancelled: boolean;
  fileName: string;
}
export interface Dataset {
  books: Book[];
  translations: Translation[];
  chapters: Record<string, Verse[]>;
}
export const defaults: Preferences = {
  bookId: "GEN",
  chapter: 1,
  topVerse: "",
  scrollOffset: 0,
  translations: ["cuv", "webp"],
  parallel: false,
  fontSize: 18,
  referencePosition: "after",
  uiLanguage: "zh-CN",
  windowX: 0,
  windowY: 0,
  windowWidth: 1280,
  windowHeight: 800,
  maximized: false,
  schemaVersion: 1,
};
export const colors: Record<string, { name: string; value: string }> = {
  yellow: { name: "黄色", value: "#fff0a8" },
  green: { name: "绿色", value: "#cdeccd" },
  blue: { name: "蓝色", value: "#cbe6fa" },
  pink: { name: "粉色", value: "#ffd5e0" },
  purple: { name: "紫色", value: "#e8d9ff" },
};
export interface API {
  ListTranslations(): Promise<Translation[]>;
  ListBooks(ids: string[]): Promise<Book[]>;
  GetChapter(
    ids: string[],
    book: string,
    chapter: number,
    request: string,
  ): Promise<Chapter>;
  GetPreferences(): Promise<Preferences>;
  SavePreferences(p: Preferences): Promise<boolean>;
  ListHighlights(
    ids: string[],
    book: string,
    chapter: number,
  ): Promise<Highlight[]>;
  ApplyHighlight(
    request: string,
    sel: Selection,
    color: string,
  ): Promise<Highlight[]>;
  CopySelection(
    sel: Selection,
    mode: string,
    ids: string[],
    options: Pick<Preferences, "referencePosition" | "uiLanguage">,
  ): Promise<boolean>;
  GetCard(sel: Selection, ids: string[], full: boolean): Promise<CardContent>;
  SaveCard(
    encoded: string,
    width: number,
    height: number,
    name: string,
    sel: Selection,
  ): Promise<Saved>;
}
export const prototype = import.meta.env.VITE_DATA_MODE === "mock";
