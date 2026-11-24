import type { Book } from "../../shared/types";
import { chapterNumbers } from "../../shared/navigation";
import { verseNumbers } from "../../shared/verse-labels";
import { matchesBookSearch } from "../../shared/book-search";
import { projectionSearchText } from "./model";

export type EntryField = "book" | "chapter" | "start" | "end";
export function entryNumber(value: string) {
  const text = projectionSearchText(value);
  return /^[0-9]{1,3}$/.test(text) && +text > 0 ? +text : undefined;
}
export function entryBook(books: Book[], value: string) {
  if (!value.trim()) return undefined;
  return books.find((book) => matchesBookSearch(book, value));
}
export function rangeEndLabels(labels: string[], start: string) {
  labels = verseNumbers(labels).map(String);
  const index = labels.indexOf(start);
  if (index < 0) return [];
  const result = [labels[index]];
  for (let i = index + 1; i < labels.length; i++) {
    if (+labels[i] !== +labels[i - 1] + 1) break;
    result.push(labels[i]);
  }
  return result;
}
export function quickReference(
  book: Book,
  chapterText: string,
  startText: string,
  endText: string | undefined,
  labels: string[],
) {
  const chapter = entryNumber(chapterText);
  if (!chapter || !chapterNumbers(book).includes(chapter))
    throw new Error("INVALID_REFERENCE");
  if (!startText.trim() && endText === undefined) return `${book.id}${chapter}`;
  const start = entryNumber(startText),
    end = endText === undefined ? start : entryNumber(endText);
  if (
    !start ||
    !end ||
    !rangeEndLabels(labels, String(start)).includes(String(end))
  )
    throw new Error("INVALID_REFERENCE");
  return `${book.id}${chapter}:${start}${end === start ? "" : "-" + end}`;
}
export function quickEntryAction(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "shiftKey"
    | "altKey"
    | "repeat"
    | "isComposing"
  >,
) {
  if (event.isComposing || event.altKey) return;
  if (
    event.key === "Tab" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
    return "next";
  if (
    event.key !== "Enter" ||
    event.repeat ||
    event.shiftKey ||
    (event.ctrlKey && event.metaKey)
  )
    return;
  return event.ctrlKey || event.metaKey ? "add" : "confirm";
}
export function seedQuickEntry(books: Book[], reference: string) {
  const match = /^([A-Z0-9]{3})([0-9]{1,3})(?::([0-9]+)(?:-([0-9]+))?)?/i.exec(
    reference,
  );
  const book = books.find((b) => b.id === match?.[1].toUpperCase()) || books[0];
  const chapter =
    match && book && chapterNumbers(book).includes(+match[2])
      ? +match[2]
      : chapterNumbers(book)[0] || 1;
  const start = match?.[3] || "1";
  return {
    bookID: book?.id || "",
    chapter,
    start,
    end: match?.[4] || start,
    range: !!match?.[4],
  };
}
