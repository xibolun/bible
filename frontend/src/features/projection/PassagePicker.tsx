import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Alert, AutoComplete, Button, Input, Space } from "antd";
import { PlusOutlined, SendOutlined } from "@ant-design/icons";
import type { InputRef } from "antd";
import type { API, Book, Chapter } from "../../shared/types";
import { chapterNumbers } from "../../shared/navigation";
import { verseNumbers } from "../../shared/verse-labels";
import { errorText, translator, type Language } from "../../shared/locale";
import { matchesBookSearch } from "../../shared/book-search";
import { projectionSearchText } from "./model";
import {
  entryBook,
  entryNumber,
  quickEntryAction,
  quickReference,
  rangeEndLabels,
  seedQuickEntry,
  type EntryField,
} from "./quick-entry";

export { rangeEndLabels } from "./quick-entry";

export function PassagePicker({
  api,
  books,
  translation,
  language,
  onAdd,
  onProject,
  disabled,
  active = true,
  focusRequest = 0,
  initialReference = "",
  publishing = false,
}: {
  api: API;
  books: Book[];
  translation: string;
  language: Language;
  onAdd: (reference: string) => boolean | void;
  onProject: (reference: string) => void | Promise<void>;
  disabled: boolean;
  active?: boolean;
  focusRequest?: number;
  initialReference?: string;
  publishing?: boolean;
}) {
  const t = translator(language);
  const [seed] = useState(() => seedQuickEntry(books, initialReference));
  const [bookID, setBookID] = useState(seed.bookID),
    [chapter, setChapter] = useState(seed.chapter);
  const name = (book: Book) =>
    language === "en" ? book.englishName : book.name;
  const [values, setValues] = useState<Record<EntryField, string>>(() => ({
    book: books.find((b) => b.id === seed.bookID)
      ? name(books.find((b) => b.id === seed.bookID)!)
      : "",
    chapter: String(seed.chapter),
    start: seed.start,
    end: seed.end,
  }));
  const [range, setRange] = useState(seed.range);
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(true),
    [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(""),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState(""),
    [retry, setRetry] = useState(0);
  const [popup, setPopup] = useState<EntryField>();
  const [filter, setFilter] = useState(false);
  const bookInput = useRef<InputRef>(null),
    chapterInput = useRef<InputRef>(null),
    startInput = useRef<InputRef>(null),
    endInput = useRef<InputRef>(null);
  const inputs = useMemo(
    () => ({
      book: bookInput,
      chapter: chapterInput,
      start: startInput,
      end: endInput,
    }),
    [],
  );
  const request = useRef(0),
    revision = useRef(0),
    submission = useRef(0);
  const pending = useRef("");
  const composing = useRef(false);
  const previousFocus = useRef({ active: false, request: focusRequest });
  const startTouched = useRef(/:[0-9]/.test(initialReference)),
    previousTranslation = useRef(translation);
  const source = useRef<
    | {
        key: string;
        api: API;
        retry: number;
        promise: Promise<Chapter>;
      }
    | undefined
  >(undefined);
  const activeOption = useRef<{ field: EntryField; value: string } | undefined>(
      undefined,
    ),
    keyboardPicking = useRef<EntryField | undefined>(undefined);
  const key = `${translation}/${bookID}/${chapter}`;
  const focus = useCallback(
    (field: EntryField) => {
      requestAnimationFrame(() =>
        inputs[field].current?.focus({ cursor: "all" }),
      );
    },
    [inputs],
  );
  const selectAll = (input: HTMLInputElement) => {
    input.select();
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.select();
    });
  };
  const getSource = useCallback(
    (id: string, ch: number) => {
      const wanted = `${translation}/${id}/${ch}`;
      if (
        !source.current ||
        source.current.key !== wanted ||
        source.current.api !== api ||
        source.current.retry !== retry
      ) {
        source.current = {
          key: wanted,
          api,
          retry,
          promise: api.GetChapter(
            [translation],
            id,
            ch,
            `projection-quick-${++request.current}`,
          ),
        };
      }
      return source.current.promise;
    },
    [api, translation, retry],
  );
  useEffect(() => {
    if (previousTranslation.current !== translation) {
      previousTranslation.current = translation;
      revision.current++;
      startTouched.current = false;
      setRange(false);
      setValues((v) => ({ ...v, start: "1", end: "1" }));
    }
    let live = true;
    setBusy(true);
    setLoadError("");
    getSource(bookID, chapter)
      .then((value) => {
        if (!live) return;
        const available = value.rows
          .filter((row) =>
            row.cells.some(
              (cell) => cell.translationId === translation && !cell.missing,
            ),
          )
          .map((row) => row.label);
        setLabels(available);
        setLoaded(key);
        if (!available.length)
          setLoadError(
            t(
              "此译本的本章没有可用经节",
              "This chapter has no available verses.",
            ),
          );
        if (!startTouched.current) {
          setValues((v) => ({
            ...v,
            start: String(verseNumbers(available)[0] || ""),
            end: String(verseNumbers(available)[0] || ""),
          }));
          requestAnimationFrame(() => {
            const input = startInput.current?.input;
            if (
              input &&
              document.activeElement === input &&
              !startTouched.current
            )
              input.select();
          });
        }
      })
      .catch((e) => {
        if (live) {
          setLoadError(errorText(e, language));
          setLoaded("");
        }
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [bookID, chapter, key, translation, getSource, language]);
  useEffect(() => {
    const requested = previousFocus.current.request !== focusRequest;
    const opened = active && !previousFocus.current.active;
    previousFocus.current = { active, request: focusRequest };
    if (!active) return;
    if (
      opened &&
      !requested &&
      Object.values(inputs).some(
        (ref) => ref.current?.input === document.activeElement,
      )
    )
      return;
    const timer = setTimeout(() => {
      if (
        opened &&
        !requested &&
        Object.values(inputs).some(
          (ref) => ref.current?.input === document.activeElement,
        )
      )
        return;
      focus("book");
    }, 100);
    return () => clearTimeout(timer);
  }, [active, focusRequest, focus, inputs]);
  useEffect(
    () => () => {
      submission.current++;
    },
    [],
  );
  const failure = (e: unknown) => {
    setError(
      (e as Error)?.message === "INVALID_REFERENCE"
        ? t(
            "书卷、章或经节无效，请检查输入",
            "Invalid book, chapter or verse. Check the entry.",
          )
        : errorText(e, language),
    );
  };
  const read = (field: EntryField) =>
    keyboardPicking.current === field && activeOption.current?.field === field
      ? activeOption.current.value
      : (inputs[field].current?.input?.value ?? values[field]);
  const edit = (field: EntryField, value: string) => {
    revision.current++;
    setError("");
    keyboardPicking.current = undefined;
    activeOption.current = undefined;
    setFilter(true);
    if (field === "start") {
      startTouched.current = true;
      setRange(false);
      setValues((v) => ({ ...v, start: value, end: value }));
    } else setValues((v) => ({ ...v, [field]: value }));
  };
  const commitBook = (value: string) => {
    const book = entryBook(books, value);
    if (!book) throw new Error("INVALID_REFERENCE");
    if (book.id !== bookID) {
      revision.current++;
      startTouched.current = false;
      setBookID(book.id);
      const firstChapter = chapterNumbers(book)[0];
      setChapter(firstChapter);
      setRange(false);
      setValues({
        book: name(book),
        chapter: String(firstChapter),
        start: "1",
        end: "1",
      });
    } else setValues((v) => ({ ...v, book: name(book) }));
    setPopup(undefined);
    return book;
  };
  const commitChapter = (value: string) => {
    const book = entryBook(books, read("book")),
      ch = entryNumber(value);
    if (!book || !ch || !chapterNumbers(book).includes(ch))
      throw new Error("INVALID_REFERENCE");
    if (ch !== chapter || book.id !== bookID) {
      revision.current++;
      startTouched.current = false;
      setBookID(book.id);
      setChapter(ch);
      setRange(false);
      setValues({
        book: name(book),
        chapter: String(ch),
        start: "1",
        end: "1",
      });
    } else setValues((v) => ({ ...v, chapter: String(ch) }));
    setPopup(undefined);
  };
  const submit = async (action: "add" | "project", field: EntryField) => {
    if (publishing) return;
    const version = revision.current,
      signature = `${version}/${action}`;
    if (pending.current === signature) return;
    const token = ++submission.current;
    pending.current = signature;
    setWorking(true);
    setPopup(undefined);
    setError("");
    try {
      const book = entryBook(books, read("book")),
        ch = entryNumber(read("chapter"));
      if (!book || !ch || !chapterNumbers(book).includes(ch))
        throw new Error("INVALID_REFERENCE");
      const start = read("start"),
        end = range && field !== "start" ? read("end") : undefined;
      const data = await getSource(book.id, ch);
      if (token !== submission.current || version !== revision.current) return;
      const available = data.rows
        .filter((row) =>
          row.cells.some(
            (cell) => cell.translationId === translation && !cell.missing,
          ),
        )
        .map((row) => row.label);
      if (!available.length) throw new Error("INVALID_REFERENCE");
      const reference = quickReference(book, String(ch), start, end, available);
      setBookID(book.id);
      setChapter(ch);
      setValues((v) => ({ ...v, book: name(book), chapter: String(ch) }));
      if (field === "start") {
        setRange(false);
        setValues((v) => ({ ...v, end: start }));
      }
      if (action === "add") {
        if (disabled) {
          setError(
            t(
              "投影清单最多12段经文，请先移除一段",
              "The projection list supports 12 passages. Remove one first.",
            ),
          );
          return;
        }
        if (onAdd(reference) !== false) focus("book");
      } else {
        await onProject(reference);
        if (version === revision.current && token === submission.current)
          focus(field === "book" || field === "chapter" ? "start" : field);
      }
    } catch (e) {
      if (token === submission.current && version === revision.current)
        failure(e);
    } finally {
      if (token === submission.current) {
        pending.current = "";
        setWorking(false);
      }
    }
  };
  const keyDown = (
    field: EntryField,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (
      composing.current ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    if (
      field === "start" &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    )
      startTouched.current = true;
    if (
      event.key === "Tab" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      field !== "book"
    ) {
      event.preventDefault();
      event.stopPropagation();
      setPopup(undefined);
      focus(
        ({ chapter: "book", start: "chapter", end: "start" } as const)[field],
      );
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      keyboardPicking.current = field;
      return;
    }
    if (event.key === "Escape" && popup) {
      event.stopPropagation();
      setPopup(undefined);
      return;
    }
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const action = quickEntryAction({
      ...event,
      isComposing: event.nativeEvent.isComposing,
    });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "add") {
      void submit("add", field);
      return;
    }
    try {
      if (field === "book") {
        commitBook(read("book"));
        focus("chapter");
      } else if (field === "chapter") {
        commitChapter(read("chapter"));
        focus("start");
      } else if (action === "confirm") {
        void submit("project", field);
      } else if (field === "start") {
        const start = read("start");
        if (!entryNumber(start)) throw new Error("INVALID_REFERENCE");
        startTouched.current = true;
        setValues((v) => ({ ...v, start, end: start }));
        setRange(true);
        setPopup(undefined);
        focus("end");
      } else {
        const book = entryBook(books, read("book"));
        if (!book) throw new Error("INVALID_REFERENCE");
        quickReference(
          book,
          read("chapter"),
          read("start"),
          read("end"),
          labels,
        );
        setPopup(undefined);
        (
          event.currentTarget
            .closest(".projection-reference-row")
            ?.querySelector("[data-project]") as HTMLButtonElement
        )?.focus();
      }
    } catch (e) {
      failure(e);
      focus(field);
    }
  };
  const select = (field: EntryField, value: string) => {
    if (composing.current) return;
    revision.current++;
    setError("");
    keyboardPicking.current = undefined;
    activeOption.current = undefined;
    setPopup(undefined);
    try {
      if (field === "book") {
        commitBook(value);
        focus("chapter");
      } else if (field === "chapter") {
        commitChapter(value);
        focus("start");
      } else {
        if (field === "start") {
          startTouched.current = true;
          setRange(false);
        }
        setValues((v) => ({
          ...v,
          [field]: value,
          ...(field === "start" ? { end: value } : {}),
        }));
        focus(field);
      }
    } catch (e) {
      failure(e);
    }
  };
  useEffect(() => {
    const book = books.find((b) => b.id === bookID) || books[0];
    if (!book) return;
    if (book.id !== bookID || !chapterNumbers(book).includes(chapter)) {
      const firstChapter = chapterNumbers(book)[0];
      revision.current++;
      startTouched.current = false;
      setBookID(book.id);
      setChapter(firstChapter);
      setRange(false);
      setValues({
        book: language === "en" ? book.englishName : book.name,
        chapter: String(firstChapter),
        start: "1",
        end: "1",
      });
    }
  }, [books, bookID, chapter, language]);
  const currentBook = entryBook(books, values.book);
  const ready = !busy && !loadError && loaded === key;
  const suggestedLabels =
    ready &&
    currentBook?.id === bookID &&
    entryNumber(values.chapter) === chapter
      ? labels
      : [];
  const options = (field: EntryField) => {
    if (field === "book")
      return books
        .filter((book) => !filter || matchesBookSearch(book, values.book))
        .map((book) => ({ value: name(book), label: name(book) }));
    const all =
      field === "chapter"
        ? chapterNumbers(currentBook).map(String)
        : field === "start"
          ? verseNumbers(suggestedLabels).map(String)
          : rangeEndLabels(
              suggestedLabels,
              String(entryNumber(values.start) || ""),
            );
    return all
      .filter(
        (value) =>
          !filter || value.includes(projectionSearchText(values[field])),
      )
      .map((value) => ({ value, label: value }));
  };
  const fieldLabels = {
    book: t("投影书卷", "Projection book"),
    chapter: t("投影章节", "Projection chapter"),
    start: t("投影起始节", "Projection start verse"),
    end: t("投影结束节", "Projection end verse"),
  };
  return (
    <div className="projection-picker">
      <Space.Compact
        block
        className="projection-reference-row"
        role="group"
        aria-label={t("快速经文", "Quick passage")}
      >
        {(
          [
            "book",
            "chapter",
            "start",
            ...(range ? ["end"] : []),
          ] as EntryField[]
        ).map((field) => (
          <AutoComplete<string>
            key={field}
            className={
              field === "book"
                ? "projection-book-select"
                : "projection-number-select"
            }
            value={values[field]}
            options={options(field)}
            open={popup === field}
            filterOption={false}
            virtual={false}
            backfill
            defaultActiveFirstOption={false}
            onChange={(value) => edit(field, value)}
            onSelect={(value) => select(field, value)}
            onActive={(value) => {
              activeOption.current = { field, value };
            }}
            onOpenChange={(open) => {
              if (!open)
                setPopup((current) =>
                  current === field ? undefined : current,
                );
            }}
          >
            <Input
              ref={inputs[field]}
              aria-label={fieldLabels[field]}
              inputMode={field === "book" ? "text" : "numeric"}
              onKeyDownCapture={(event) => keyDown(field, event)}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onFocus={(event) => {
                keyboardPicking.current = undefined;
                activeOption.current = undefined;
                setFilter(false);
                setPopup(field);
                selectAll(event.target);
              }}
              onClick={(event) => {
                selectAll(event.currentTarget);
                setPopup(field);
              }}
              onBlur={() =>
                setPopup((current) => (current === field ? undefined : current))
              }
            />
          </AutoComplete>
        ))}
        <Button
          data-project
          icon={<SendOutlined />}
          aria-label={t("投放", "Project")}
          title={t("投放 · Enter", "Project · Enter")}
          disabled={publishing || !ready}
          loading={publishing}
          onClick={() => void submit("project", range ? "end" : "start")}
        />
        <Button
          icon={<PlusOutlined />}
          aria-label={t("加入投影清单", "Add to projection list")}
          title={t(
            "加入投影清单 · Ctrl/⌘+Enter",
            "Add to projection list · Ctrl/⌘+Enter",
          )}
          disabled={disabled || publishing || !ready}
          onClick={() => void submit("add", range ? "end" : "start")}
        />
      </Space.Compact>
      <p className="projection-hint">
        {t(
          "Tab：书卷 → 章 → 起始节 → 截止节；Enter 投屏；Ctrl/⌘+Enter 加入清单。",
          "Tab: book → chapter → start → optional end. Enter projects; Ctrl/⌘+Enter adds to the list.",
        )}
      </p>
      {(error || loadError) && (
        <Alert
          role="alert"
          type="error"
          showIcon
          title={error || loadError}
          action={
            loadError && (
              <Button
                aria-label={t("重试", "Retry")}
                onClick={() => {
                  setError("");
                  setRetry((n) => n + 1);
                }}
              >
                {t("重试", "Retry")}
              </Button>
            )
          }
        />
      )}
      {working && !publishing && (
        <span role="status">{t("正在确认经文…", "Checking passage…")}</span>
      )}
    </div>
  );
}
