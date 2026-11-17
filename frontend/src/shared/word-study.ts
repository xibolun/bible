import type { DictionaryEntry, WordStudy, VerseStudy } from "./types";

export function lookupWord(data: WordStudy, code: string): DictionaryEntry {
  code = code.trim().toUpperCase();
  if (!/^[HG][0-9]{1,5}$/.test(code)) throw new Error("INVALID_WORD");
  code = code[0] + Number(code.slice(1));
  const entry = entryFor(data, code);
  if (!entry) throw new Error("WORD_NOT_FOUND");
  return entry;
}

function entryFor(data: WordStudy, code: string): DictionaryEntry | undefined {
  const english = data.entries[code];
  const chinese = data.chinese[code];
  if (!english && !chinese) return undefined;
  return {
    ...(english ?? {
      id: code,
      lemma: chinese.lemma,
      language: code[0] === "H" ? "Hebrew" : "Greek",
      transliteration: "",
      pronunciation: "",
      definition: "",
      source: "",
    }),
    chineseDefinition: chinese?.definition,
    chineseSource: chinese?.source,
  };
}

export function verseWords(data: WordStudy, key: string): VerseStudy {
  const words = data.verses[key];
  if (!words) throw new Error("INVALID_REFERENCE");
  const codes = [...new Set(words.flatMap((word) => word.strongs))];
  return {
    words,
    entries: codes.flatMap((code) => {
      const entry = entryFor(data, code);
      return entry ? [entry] : [];
    }),
  };
}

let cached: Promise<WordStudy> | undefined;
export function loadWordStudy(): Promise<WordStudy> {
  return (cached ??= Promise.all([
    fetch("/word-study.json"),
    fetch("/chinese-dictionary.json"),
  ])
    .then(async ([study, chinese]) => {
      if (!study.ok || !chinese.ok) throw new Error("DATA_UNAVAILABLE");
      return {
        ...(await study.json()),
        chinese: await chinese.json(),
      } as WordStudy;
    })
    .catch(() => {
      cached = undefined;
      throw new Error("DATA_UNAVAILABLE");
    }));
}
