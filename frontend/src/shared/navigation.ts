import type { Book } from "./types";

export function adjacentChapter(
  books: Book[],
  bookId: string,
  chapter: number,
  direction: -1 | 1,
) {
  const index = books.findIndex((book) => book.id === bookId);
  const book = books[index];
  if (!book || chapter < 1 || chapter > book.chapters) return undefined;
  const next = chapter + direction;
  if (next >= 1 && next <= book.chapters) return { bookId, chapter: next };
  const neighbor = books[index + direction];
  return neighbor
    ? { bookId: neighbor.id, chapter: direction === 1 ? 1 : neighbor.chapters }
    : undefined;
}
