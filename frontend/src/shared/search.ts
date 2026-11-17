import type { Dataset, SearchPage } from "./types";
type Token = { kind: "%" | "_" | "literal"; char?: string };
const lower = (ch: string) => (ch >= "A" && ch <= "Z" ? ch.toLowerCase() : ch);
export function likePattern(pattern: string): Token[] {
  pattern = pattern.trim();
  if (!pattern || [...pattern].length > 128) throw new Error("INVALID_SEARCH");
  const tokens: Token[] = [{ kind: "%" }];
  let escape = false;
  for (const ch of pattern) {
    if (escape) {
      tokens.push({ kind: "literal", char: lower(ch) });
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "%" || ch === "_") {
      if (ch !== "%" || tokens.at(-1)?.kind !== "%") tokens.push({ kind: ch });
    } else tokens.push({ kind: "literal", char: lower(ch) });
  }
  if (escape) throw new Error("INVALID_SEARCH");
  if (tokens.at(-1)?.kind !== "%") tokens.push({ kind: "%" });
  return tokens;
}
export function likeMatch(text: string, pattern: Token[]) {
  const chars = [...text];
  let i = 0,
    j = 0,
    star = -1,
    retry = 0;
  while (i < chars.length) {
    if (
      pattern[j]?.kind === "_" ||
      (pattern[j]?.kind === "literal" && pattern[j].char === lower(chars[i]))
    ) {
      i++;
      j++;
      continue;
    }
    if (pattern[j]?.kind === "%") {
      star = j++;
      retry = i;
      continue;
    }
    if (star >= 0) {
      i = ++retry;
      j = star + 1;
      continue;
    }
    return false;
  }
  while (pattern[j]?.kind === "%") j++;
  return j === pattern.length;
}
export function searchScripture(
  data: Dataset,
  translation: string,
  pattern: string,
  offset: number,
  limit: number,
): SearchPage {
  if (!data.translations.some((value) => value.id === translation))
    throw new Error("INVALID_TRANSLATION");
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error("INVALID_SEARCH");
  const compiled = likePattern(pattern);
  const page: SearchPage = { total: 0, results: [] };
  for (const book of data.books)
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      for (const verse of data.chapters[
        `${translation}/${book.id}/${chapter}`
      ] ?? []) {
        if (!likeMatch(verse.text, compiled)) continue;
        if (page.total >= offset && page.results.length < limit)
          page.results.push({
            translationId: translation,
            bookId: book.id,
            bookName: book.name,
            englishName: book.englishName,
            chapter,
            verseKey: verse.label,
            text: verse.text,
          });
        page.total++;
      }
    }
  return page;
}
