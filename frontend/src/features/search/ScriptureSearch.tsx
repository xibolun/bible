import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Pagination,
  Select,
  Spin,
} from "antd";
import { errorText, translator, type Language } from "../../shared/locale";
import type {
  API,
  SearchHit,
  SearchPage,
  Translation,
} from "../../shared/types";

export function ScriptureSearch({
  api,
  translations,
  initialTranslation,
  language,
  onClose,
  onSelect,
}: {
  api: API;
  translations: Translation[];
  initialTranslation: string;
  language: Language;
  onClose: () => void;
  onSelect: (hit: SearchHit) => void;
}) {
  const t = translator(language);
  const [translation, setTranslation] = useState(initialTranslation);
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!pattern) return;
    const n = ++request.current;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    api
      .SearchScripture(translation, pattern, (page - 1) * 30, 30)
      .then((value) => {
        if (n !== request.current) return;
        setResult(value);
        if (list.current) list.current.scrollTop = 0;
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
  }, [api, translation, pattern, page, retry]);
  return (
    <Drawer
      open
      title={t("经文搜索", "Scripture search")}
      size={600}
      onClose={onClose}
    >
      <div className="scripture-search">
        <Select
          aria-label={t("搜索译本", "Search translation")}
          value={translation}
          options={translations.map((value) => ({
            value: value.id,
            label: `${value.abbreviation} · ${value.name}`,
          }))}
          onChange={(value) => {
            setTranslation(value);
            setPage(1);
          }}
        />
        <Input.Search
          autoFocus
          aria-label={t("搜索条件", "Search pattern")}
          placeholder={t("例如：起%神", "For example: beginning%God")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={256}
          enterButton={t("搜索", "Search")}
          onSearch={(value) => {
            ++request.current;
            setBusy(false);
            setPage(1);
            setPattern(value.trim());
            setRetry((n) => n + 1);
            if (!value.trim()) {
              setResult(undefined);
              setError(new Error("INVALID_SEARCH"));
            }
          }}
        />
        <p className="study-source">
          {t(
            "在整节经文中搜索。% 匹配任意长度，_ 匹配一个字；\\% 和 \\_ 搜索符号本身。例如 起%神 可找到“起初，神创造天地”。",
            "Search within each verse. % matches any length; _ matches one character. Use \\% or \\_ for literal symbols. English matching ignores ASCII letter case.",
          )}
        </p>
        {error !== undefined && (
          <Alert
            type="error"
            showIcon
            title={errorText(error, language)}
            action={
              <Button onClick={() => setRetry((n) => n + 1)}>
                {t("重试", "Retry")}
              </Button>
            }
          />
        )}
        <Spin spinning={busy}>
          {result ? (
            <>
              <p role="status">
                {t(
                  `找到 ${result.total} 节经文`,
                  `${result.total} verses found`,
                )}
              </p>
              {result.total ? (
                <ol
                  ref={list}
                  className="search-results"
                  aria-label={t("搜索结果", "Search results")}
                >
                  {result.results.map((hit) => (
                    <li key={`${hit.bookId}/${hit.chapter}/${hit.verseKey}`}>
                      <button
                        onClick={() => onSelect(hit)}
                        aria-label={t(
                          `前往${hit.bookName}${hit.chapter}:${hit.verseKey}`,
                          `Go to ${hit.englishName} ${hit.chapter}:${hit.verseKey}`,
                        )}
                      >
                        <strong>
                          {language === "en" ? hit.englishName : hit.bookName}{" "}
                          {hit.chapter}:{hit.verseKey}
                        </strong>
                        <span>{hit.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty
                  description={t(
                    "没有找到符合条件的经文",
                    "No matching verses",
                  )}
                />
              )}
            </>
          ) : (
            !busy &&
            error === undefined && (
              <Empty
                description={t(
                  "输入文字或通配符开始搜索",
                  "Enter text or a wildcard pattern to search",
                )}
              />
            )
          )}
        </Spin>
        {result && result.total > 30 && (
          <Pagination
            current={page}
            total={result.total}
            pageSize={30}
            showSizeChanger={false}
            onChange={setPage}
          />
        )}
      </div>
    </Drawer>
  );
}
