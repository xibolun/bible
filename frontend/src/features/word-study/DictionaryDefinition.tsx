import { Empty } from "antd";
import { translator, type Language } from "../../shared/locale";
import type { DictionaryEntry } from "../../shared/types";
import { chineseMeaning } from "./definition";

export function DictionaryDefinition({
  entry,
  language,
}: {
  entry: DictionaryEntry;
  language: Language;
}) {
  const t = translator(language);
  return (
    <article
      className="dictionary-entry"
      aria-label={t("词典释义", "Dictionary definition")}
    >
      <div className="entry-code">
        {entry.id} ·{" "}
        {entry.language === "Greek"
          ? t("希腊文", "Greek")
          : entry.language === "Aramaic"
            ? t("亚兰文", "Aramaic")
            : t("希伯来文", "Hebrew")}
      </div>
      <h2 lang={entry.language === "Greek" ? "grc" : "he"} dir="auto">
        {entry.lemma}
      </h2>
      <h3>{t("中文释义", "Chinese definition")}</h3>
      {entry.chineseDefinition ? (
        <>
          <p lang="zh-Hant" className="entry-definition chinese-meaning">
            {chineseMeaning(entry.chineseDefinition)}
          </p>
          <small className="study-source">{entry.chineseSource}</small>
          <details className="english-definition">
            <summary>
              {t(
                "完整词典原文（含音译与统计）",
                "Complete source entry, transliteration and statistics",
              )}
            </summary>
            <p lang="zh-Hant" className="entry-definition">
              {entry.chineseDefinition}
            </p>
          </details>
        </>
      ) : (
        <Empty
          description={t(
            "此编号暂无中文释义",
            "No Chinese definition for this number",
          )}
        />
      )}
      {entry.definition && (
        <details className="english-definition">
          <summary>{t("英文原始释义", "English source definition")}</summary>
          <p className="entry-pronunciation">
            {entry.transliteration} {entry.pronunciation}
          </p>
          <p lang="en" className="entry-definition">
            {entry.definition}
          </p>
          <small className="study-source">{entry.source}</small>
        </details>
      )}
    </article>
  );
}
