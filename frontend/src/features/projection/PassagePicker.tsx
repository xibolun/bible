import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Select, Spin } from "antd";
import type { API, Book } from "../../shared/types";
import { errorText, translator, type Language } from "../../shared/locale";
import { projectionSearchText } from "./model";

// End choices stop at a source-label hole, matching native range validation.
export function rangeEndLabels(labels: string[], start: string) {
  const index = labels.indexOf(start);
  if (index < 0) return [];
  const result = [labels[index]];
  for (let i = index + 1; i < labels.length; i++) {
    if (+labels[i] !== +labels[i - 1] + 1) break;
    result.push(labels[i]);
  }
  return result;
}
export function PassagePicker({
  api,
  books,
  translation,
  language,
  onAdd,
  disabled,
}: {
  api: API;
  books: Book[];
  translation: string;
  language: Language;
  onAdd: (reference: string) => void;
  disabled: boolean;
}) {
  const t = translator(language);
  const [bookID, setBookID] = useState(books[0]?.id || "GEN");
  const [chapter, setChapter] = useState(1);
  const [labels, setLabels] = useState<string[]>([]);
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const book = books.find((b) => b.id === bookID);
  const key = `${translation}/${bookID}/${chapter}`;
  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    api
      .GetChapter([translation], bookID, chapter, `projection-picker-${id}`)
      .then((value) => {
        if (request.current !== id) return;
        const available = value.rows
          .filter((row) =>
            row.cells.some(
              (cell) => cell.translationId === translation && !cell.missing,
            ),
          )
          .map((row) => row.label);
        if (!available.length) {
          setError(
            language === "en"
              ? "This chapter has no available verses."
              : "此译本的本章没有可用经节",
          );
        }
        setLabels(available);
        setStart(available[0] || "");
        setEnd(available[0] || "");
        setLoaded(key);
      })
      .catch((e) => {
        if (request.current === id) {
          setError(errorText(e, language));
          setLoaded("");
        }
      })
      .finally(() => {
        if (request.current === id) setBusy(false);
      });
    return () => {
      request.current++;
    };
  }, [api, translation, bookID, chapter, key, language, retry]);
  const ready = !busy && !error && loaded === key && !!start && !!end;
  const numberFilter = (input: string, option?: { label?: ReactNode }) =>
    projectionSearchText(String(option?.label || "")).includes(
      projectionSearchText(input),
    );
  return (
    <div className="projection-picker">
      <div className="projection-fields">
        <label>
          {t("书卷", "Book")}
          <Select
            aria-label={t("投影书卷", "Projection book")}
            value={bookID}
            showSearch
            options={books.map((b) => ({
              value: b.id,
              label: language === "en" ? b.englishName : b.name,
              search: `${b.name} ${b.abbreviation} ${b.englishName} ${b.id} ${b.englishName.replace(/^(III|II|I) /, (_, r: string) => ({ I: "1 ", II: "2 ", III: "3 " })[r]!)}`,
            }))}
            filterOption={(input, option) =>
              projectionSearchText(option?.search || "").includes(
                projectionSearchText(input),
              )
            }
            onChange={(value) => {
              setBookID(value);
              setChapter(1);
            }}
          />
        </label>
        <label>
          {t("章", "Chapter")}
          <Select<number>
            aria-label={t("投影章节", "Projection chapter")}
            value={chapter}
            showSearch
            options={Array.from({ length: book?.chapters || 0 }, (_, i) => ({
              value: i + 1,
              label: String(i + 1),
            }))}
            filterOption={numberFilter}
            onChange={setChapter}
          />
        </label>
        <label>
          {t("起始节", "Start verse")}
          <Select
            aria-label={t("投影起始节", "Projection start verse")}
            value={ready ? start : undefined}
            showSearch
            loading={busy}
            disabled={!ready}
            options={labels.map((label) => ({ value: label, label }))}
            filterOption={numberFilter}
            onChange={(value) => {
              setStart(value);
              setEnd(value);
            }}
          />
        </label>
        <label>
          {t("结束节", "End verse")}
          <Select
            aria-label={t("投影结束节", "Projection end verse")}
            value={ready ? end : undefined}
            showSearch
            disabled={!ready}
            options={rangeEndLabels(labels, start).map((label) => ({
              value: label,
              label,
            }))}
            filterOption={numberFilter}
            onChange={setEnd}
          />
        </label>
      </div>
      {busy && (
        <Spin size="small" aria-label={t("正在加载经节", "Loading verses")} />
      )}
      {error && (
        <Alert
          role="alert"
          type="error"
          title={error}
          action={
            <Button
              aria-label={t("重试", "Retry")}
              onClick={() => setRetry((n) => n + 1)}
            >
              {t("重试", "Retry")}
            </Button>
          }
        />
      )}
      <Button
        disabled={!ready || disabled}
        onClick={() =>
          onAdd(`${bookID}${chapter}:${start}${start === end ? "" : "-" + end}`)
        }
      >
        {t("加入投影清单", "Add to projection list")}
      </Button>
    </div>
  );
}
