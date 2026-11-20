import { expect, type Page } from "@playwright/test";

export const entry = (
  page: Page,
  field: "book" | "chapter" | "start" | "end",
) =>
  page.getByRole("combobox", {
    name: {
      book: "投影书卷",
      chapter: "投影章节",
      start: "投影起始节",
      end: "投影结束节",
    }[field],
    exact: true,
  });
export async function setPassage(
  page: Page,
  book: string,
  chapter: string,
  start: string,
  end?: string,
) {
  await entry(page, "book").fill(book);
  await entry(page, "book").press("Tab");
  await expect(entry(page, "chapter")).toBeFocused();
  await entry(page, "chapter").fill(chapter);
  await entry(page, "chapter").press("Tab");
  await expect(entry(page, "start")).toBeFocused();
  await entry(page, "start").fill(start);
  if (end !== undefined) {
    await entry(page, "start").press("Tab");
    await expect(entry(page, "end")).toBeFocused();
    await entry(page, "end").fill(end);
  }
  return entry(page, end === undefined ? "start" : "end");
}
export async function addPassage(
  page: Page,
  book: string,
  chapter: string,
  start: string,
  end?: string,
) {
  const input = await setPassage(page, book, chapter, start, end);
  await input.press("Control+Enter");
  await expect(entry(page, "book")).toBeFocused();
}
