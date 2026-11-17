import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Select, Spin } from "antd";
import { errorText, translator, type Language } from "../../shared/locale";
import type {
  API,
  Book,
  DictionaryEntry,
  VerseStudy,
} from "../../shared/types";

export function WordStudy({
  api,
  book,
  chapter,
  initialVerse,
  verses,
  language,
  onClose,
}: {
  api: API;
  book: Book;
  chapter: number;
  initialVerse: string;
  verses: string[];
  language: Language;
  onClose: () => void;
}) {
  const t = translator(language);
  const [verse, setVerse] = useState(initialVerse);
  const [study, setStudy] = useState<VerseStudy>();
  const [entry, setEntry] = useState<DictionaryEntry>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const n = ++request.current;
    setBusy(true);
    setError(undefined);
    setStudy(undefined);
    setEntry(undefined);
    api
      .GetVerseWords(book.id, chapter, verse)
      .then((value) => {
        if (n !== request.current) return;
        setStudy(value);
        setEntry(value.entries[0]);
      })
      .catch((error: unknown) => {
        if (n === request.current) setError(error);
      })
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
    return () => {
      ++request.current;
    };
  }, [api, book.id, chapter, verse, retry]);
  const search = useCallback(
    async (code: string) => {
      const n = ++request.current;
      setBusy(true);
      setError(undefined);
      setEntry(undefined);
      try {
        const value = await api.LookupWord(code);
        if (n === request.current) setEntry(value);
      } catch (error) {
        if (n === request.current) setError(error);
      } finally {
        if (n === request.current) setBusy(false);
      }
    },
    [api],
  );
  return (
    <Drawer
      open
      title={t("原文字典注解", "Original-language dictionary")}
      onClose={onClose}
      size={480}
    >
      <div className="word-study">
        <p className="study-source">
          {t(
            "经节关联：KJV 3.1 Strong’s 标注，不代表中文译本逐词对应。中文释义来自信望爱 CBOL（保留原始繁体），可离线使用。",
            "Verse links use KJV 3.1 Strong’s annotations, not word alignment for other translations. Chinese definitions from FHL CBOL retain Traditional Chinese and work offline.",
          )}
        </p>
        <label className="study-verse-label">
          {t("当前经节", "Current verse")}
          <Select
            aria-label={t("词典经节", "Dictionary verse")}
            value={verse}
            onChange={setVerse}
            options={verses.map((label) => ({
              value: label,
              label: `${language === "en" ? book.englishName : book.name} ${chapter}:${label}`,
            }))}
          />
        </label>
        <Input.Search
          aria-label={t("Strong’s 编号", "Strong’s number")}
          placeholder="H430 / G3056"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={(code) => void search(code)}
          enterButton={t("查词", "Look up")}
          maxLength={12}
        />
        {error !== undefined && (
          <Alert
            showIcon
            type="error"
            title={errorText(error, language)}
            action={
              <Button
                onClick={() => {
                  if (query) void search(query);
                  else setRetry((n) => n + 1);
                }}
              >
                {t("重试", "Retry")}
              </Button>
            }
          />
        )}
        <Spin spinning={busy}>
          {study && (
            <section aria-label={t("经节关联词组", "Verse word links")}>
              <h3>
                {t("经节关联词组", "Verse word links")} <small>KJV</small>
              </h3>
              <div className="study-words">
                {study.words.flatMap((word, index) =>
                  word.strongs.map((code) => {
                    const available = study.entries.some(
                      (value) => value.id === code,
                    );
                    return (
                      <button
                        key={`${index}-${code}`}
                        className="study-word"
                        aria-pressed={entry?.id === code}
                        disabled={!available}
                        title={
                          available
                            ? undefined
                            : t(
                                "此编号无词典释义（可能为源文语法编号）",
                                "No dictionary entry for this source code",
                              )
                        }
                        onClick={() => {
                          ++request.current;
                          setBusy(false);
                          setError(undefined);
                          setEntry(
                            study.entries.find((value) => value.id === code),
                          );
                        }}
                      >
                        <span>{word.text}</span>
                        <small>{code}</small>
                      </button>
                    );
                  }),
                )}
              </div>
              {!study.words.length && (
                <Empty
                  description={t(
                    "此节没有原文词条标注，可按编号查词",
                    "No word annotations for this verse. Look up a Strong’s number.",
                  )}
                />
              )}
            </section>
          )}
          {entry && (
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
              <p className="entry-pronunciation">
                {entry.transliteration} {entry.pronunciation}
              </p>
              <h3>{t("中文释义", "Chinese definition")}</h3>
              {entry.chineseDefinition ? (
                <>
                  <p lang="zh-Hant" className="entry-definition">
                    {entry.chineseDefinition}
                  </p>
                  <small className="study-source">{entry.chineseSource}</small>
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
                  <summary>
                    {t("英文原始释义", "English source definition")}
                  </summary>
                  <p lang="en" className="entry-definition">
                    {entry.definition}
                  </p>
                  <small className="study-source">{entry.source}</small>
                </details>
              )}
            </article>
          )}
        </Spin>
      </div>
    </Drawer>
  );
}
