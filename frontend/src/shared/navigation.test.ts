import { expect, it } from "vitest";
import { adjacentChapter } from "./navigation";
import type { Book } from "./types";

const books = [
  { id: "GEN", chapters: 50 },
  { id: "EXO", chapters: 40 },
  { id: "REV", chapters: 22 },
].map((book) => ({
  ...book,
  name: book.id,
  englishName: book.id,
  abbreviation: book.id,
  testament: "OT",
})) as Book[];
it("crosses book boundaries in either direction and stops at canon ends", () => {
  expect(adjacentChapter(books, "GEN", 50, 1)).toEqual({
    bookId: "EXO",
    chapter: 1,
  });
  expect(adjacentChapter(books, "EXO", 1, -1)).toEqual({
    bookId: "GEN",
    chapter: 50,
  });
  expect(adjacentChapter(books, "EXO", 40, 1)).toEqual({
    bookId: "REV",
    chapter: 1,
  });
  expect(adjacentChapter(books, "REV", 1, -1)).toEqual({
    bookId: "EXO",
    chapter: 40,
  });
  expect(adjacentChapter(books, "GEN", 1, -1)).toBeUndefined();
  expect(adjacentChapter(books, "REV", 22, 1)).toBeUndefined();
  expect(adjacentChapter(books, "GEN", 1, 1)).toEqual({
    bookId: "GEN",
    chapter: 2,
  });
  expect(adjacentChapter(books, "BAD", 1, 1)).toBeUndefined();
});
