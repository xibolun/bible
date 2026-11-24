import type { Book } from "./types";

export const chapterNumbers = (book?: Book) =>
  book?.chapterNumbers ??
  Array.from({ length: book?.chapters ?? 0 }, (_, i) => i + 1);

export function adjacentChapter(
  books: Book[],
  bookId: string,
  chapter: number,
  direction: -1 | 1,
) {
  const index = books.findIndex((book) => book.id === bookId);
  const book = books[index];
  if (!book || chapter < 1 || chapter > book.chapters) return undefined;
  const numbers = chapterNumbers(book),
    position = numbers.indexOf(chapter);
  const next = numbers[position + direction];
  if (position >= 0 && next !== undefined) return { bookId, chapter: next };
  const neighbor = books[index + direction];
  return neighbor
    ? {
        bookId: neighbor.id,
        chapter:
          direction === 1
            ? chapterNumbers(neighbor)[0]
            : chapterNumbers(neighbor).at(-1)!,
      }
    : undefined;
}
