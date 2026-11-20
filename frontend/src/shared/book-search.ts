import type { Book } from "./types";

// Fixed canon names need explicit syllables, including title-specific readings
// such as 使徒行传 (xing zhuan). This index never changes displayed scripture.
export const bookPinyin: Record<string, readonly [string, string]> = {
  GEN: ["chuang shi ji", "chuang"],
  EXO: ["chu ai ji ji", "chu"],
  LEV: ["li wei ji", "li"],
  NUM: ["min shu ji", "min"],
  DEU: ["shen ming ji", "shen"],
  JOS: ["yue shu ya ji", "shu"],
  JDG: ["shi shi ji", "shi"],
  RUT: ["lu de ji", "de"],
  "1SA": ["sa mu er ji shang", "sa shang"],
  "2SA": ["sa mu er ji xia", "sa xia"],
  "1KI": ["lie wang ji shang", "wang shang"],
  "2KI": ["lie wang ji xia", "wang xia"],
  "1CH": ["li dai zhi shang", "dai shang"],
  "2CH": ["li dai zhi xia", "dai xia"],
  EZR: ["yi si la ji", "la"],
  NEH: ["ni xi mi ji", "ni"],
  EST: ["yi si tie ji", "si"],
  JOB: ["yue bo ji", "bo"],
  PSA: ["shi pian", "shi"],
  PRO: ["zhen yan", "zhen"],
  ECC: ["chuan dao shu", "chuan"],
  SNG: ["ya ge", "ge"],
  ISA: ["yi sai ya shu", "sai"],
  JER: ["ye li mi shu", "ye"],
  LAM: ["ye li mi ai ge", "ai"],
  EZK: ["yi xi jie shu", "jie"],
  DAN: ["dan yi li shu", "dan"],
  HOS: ["he xi a shu", "he"],
  JOL: ["yue er shu", "er"],
  AMO: ["a mo si shu", "mo"],
  OBA: ["e ba di ya shu", "e"],
  JON: ["yue na shu", "na"],
  MIC: ["mi jia shu", "mi"],
  NAM: ["na hong shu", "hong"],
  HAB: ["ha ba gu shu", "ha"],
  ZEP: ["xi fan ya shu", "fan"],
  HAG: ["ha gai shu", "gai"],
  ZEC: ["sa jia li ya shu", "ya"],
  MAL: ["ma la ji shu", "ma"],
  MAT: ["ma tai fu yin", "tai"],
  MRK: ["ma ke fu yin", "ke"],
  LUK: ["lu jia fu yin", "lu"],
  JHN: ["yue han fu yin", "yue"],
  ACT: ["shi tu xing zhuan", "tu"],
  ROM: ["luo ma shu", "luo"],
  "1CO": ["ge lin duo qian shu", "lin qian"],
  "2CO": ["ge lin duo hou shu", "lin hou"],
  GAL: ["jia la tai shu", "jia"],
  EPH: ["yi fu suo shu", "fu"],
  PHP: ["fei li bi shu", "fei"],
  COL: ["ge luo xi shu", "xi"],
  "1TH": ["tie sa luo ni jia qian shu", "tie qian"],
  "2TH": ["tie sa luo ni jia hou shu", "tie hou"],
  "1TI": ["ti mo tai qian shu", "ti qian"],
  "2TI": ["ti mo tai hou shu", "ti hou"],
  TIT: ["ti duo shu", "duo"],
  PHM: ["fei li men shu", "men"],
  HEB: ["xi bo lai shu", "lai"],
  JAS: ["ya ge shu", "ya"],
  "1PE": ["bi de qian shu", "bi qian"],
  "2PE": ["bi de hou shu", "bi hou"],
  "1JN": ["yue han yi shu", "yue yi"],
  "2JN": ["yue han er shu", "yue er"],
  "3JN": ["yue han san shu", "yue san"],
  JUD: ["you da shu", "you"],
  REV: ["qi shi lu", "qi"],
};

export const normalizeBookSearch = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'’_-]/g, "")
    .toLowerCase();

export function matchesBookSearch(book: Book, query: string): boolean {
  const pinyin = bookPinyin[book.id] || [];
  const numericName = book.englishName.replace(
    /^(III|II|I) /,
    (_, roman: string) => ({ I: "1 ", II: "2 ", III: "3 " })[roman]!,
  );
  const aliases = [
    book.name,
    book.abbreviation,
    book.id,
    book.englishName,
    numericName,
    ...pinyin.flatMap((syllables) => [
      syllables,
      syllables
        .split(" ")
        .map((s) => s[0])
        .join(""),
    ]),
  ];
  const needle = normalizeBookSearch(query);
  return aliases.some((alias) => normalizeBookSearch(alias).includes(needle));
}
