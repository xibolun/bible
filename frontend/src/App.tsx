import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  ConfigProvider,
  Dropdown,
  Empty,
  Select,
  Space,
  Spin,
  Switch,
  Tooltip,
  theme as antTheme,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { getAPI } from "./shared/api";
import {
  colors,
  defaults,
  prototype,
  type API,
  type Book,
  type Chapter,
  type Highlight,
  type Preferences,
  type SearchHit,
  type SearchHistoryEntry,
  type Selection,
  type Translation,
} from "./shared/types";
import { captureSelection, wholeVerses } from "./shared/selection";
import { CardEditor } from "./features/cards/CardEditor";
import { drawCard } from "./features/cards/layout";
import { appVersion } from "./shared/build";
import { Settings } from "./features/settings/Settings";
import { WordStudy } from "./features/word-study/WordStudy";
import { ScriptureSearch } from "./features/search/ScriptureSearch";
import { adjacentChapter } from "./shared/navigation";
import { keywordRanges, rememberSearch } from "./shared/search";
import { commandShortcut, saveAndQuit } from "./shared/shortcuts";
import { palettes, type ReadingTheme } from "./shared/themes";
import {
  SelectionToolbar,
  type SelectionAnchor,
} from "./features/selection/SelectionToolbar";
import { translator, errorText, type Language } from "./shared/locale";

function MarkedText({
  text,
  marks,
  pattern,
}: {
  text: string;
  marks: Highlight[];
  pattern?: string;
}) {
  const points = [...text];
  const pieces: React.ReactNode[] = [];
  const matches = pattern ? keywordRanges(text, pattern) : [];
  const edges = [
    ...new Set([
      0,
      points.length,
      ...[...marks, ...matches].flatMap(({ start, end }) => [start, end]),
    ]),
  ].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i],
      end = edges[i + 1];
    const saved = marks.find((mark) => mark.start <= start && mark.end >= end);
    const found = matches.some(
      (range) => range.start <= start && range.end >= end,
    );
    const value = points.slice(start, end).join("");
    pieces.push(
      saved || found ? (
        <mark
          key={start}
          className={found ? "search-keyword" : undefined}
          style={
            found ? undefined : { background: colors[saved!.color]?.value }
          }
        >
          {value}
        </mark>
      ) : (
        value
      ),
    );
  }
  return <>{pieces}</>;
}

function Reader({
  onLanguage,
  onTheme,
  onGlobalFontSize,
}: {
  onLanguage: (language: Language) => void;
  onTheme: (theme: ReadingTheme) => void;
  onGlobalFontSize: (size: number) => void;
}) {
  const { message } = AntApp.useApp();
  const [api, setAPI] = useState<API>(),
    [books, setBooks] = useState<Book[]>([]),
    [translations, setTranslations] = useState<Translation[]>([]),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [chapter, setChapter] = useState<Chapter>(),
    [highlights, setHighlights] = useState<Highlight[]>([]);
  const [starting, setStarting] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [annotationError, setAnnotationError] = useState(""),
    [selection, setSelection] = useState<Selection | null>(null),
    [painting, setPainting] = useState(false),
    [card, setCard] = useState<Selection | null>(null),
    [settings, setSettings] = useState(false),
    [searching, setSearching] = useState(false),
    [studyVerse, setStudyVerse] = useState<string | null>(null),
    [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor>(),
    [retry, setRetry] = useState(0);
  const [searchTarget, setSearchTarget] = useState<{
    hit: SearchHit;
    pattern: string;
  }>();
  const [searchFocus, setSearchFocus] = useState(0);
  const quitting = useRef(false);
  const scroll = useRef<HTMLDivElement>(null),
    request = useRef(0),
    scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    persistRequest = useRef(0),
    restoring = useRef(false),
    smokeActive = useRef(false);
  const dismissSelection = useCallback(() => setSelection(null), []);
  const currentPrefs = useRef(prefs);
  currentPrefs.current = prefs;
  const remember = useCallback((entry: SearchHistoryEntry) => {
    setPrefs((p) => ({
      ...p,
      searchHistory: rememberSearch(p.searchHistory, entry),
    }));
  }, []);
  const clearSearchHistory = useCallback(() => {
    setPrefs((p) => ({ ...p, searchHistory: [] }));
  }, []);
  const closeSearch = useCallback((anchor?: HTMLElement) => {
    const viewport = scroll.current;
    const row =
      anchor ??
      Array.from(
        viewport?.querySelectorAll<HTMLElement>("[data-row]") ?? [],
      ).find(
        (element) =>
          element.getBoundingClientRect().bottom >
          (viewport?.getBoundingClientRect().top ?? 0),
      );
    const top = row?.getBoundingClientRect().top;
    setSearching(false);
    requestAnimationFrame(() => {
      if (viewport && row && top !== undefined)
        viewport.scrollTop += row.getBoundingClientRect().top - top;
    });
  }, []);
  const t = translator(prefs.uiLanguage);
  const openSearch = useCallback(() => {
    setSelection(null);
    setSettings(false);
    setStudyVerse(null);
    setSearching(true);
    setSearchFocus((n) => n + 1);
  }, []);
  useEffect(() => {
    onGlobalFontSize(prefs.globalFontSize);
    document.documentElement.style.setProperty(
      "--font-scale",
      String(prefs.globalFontSize / 13),
    );
  }, [onGlobalFontSize, prefs.globalFontSize]);
  const previousChapter = adjacentChapter(
    books,
    prefs.bookId,
    prefs.chapter,
    -1,
  );
  const nextChapter = adjacentChapter(books, prefs.bookId, prefs.chapter, 1);
  useEffect(() => {
    onLanguage(prefs.uiLanguage);
    document.documentElement.lang = prefs.uiLanguage;
  }, [onLanguage, prefs.uiLanguage]);
  useEffect(() => {
    onTheme(prefs.readingTheme);
    document.documentElement.dataset.readingTheme = prefs.readingTheme;
    document.documentElement.style.colorScheme =
      prefs.readingTheme === "night" ? "dark" : "light";
    for (const [key, value] of Object.entries(palettes[prefs.readingTheme]))
      document.documentElement.style.setProperty(`--reading-${key}`, value);
  }, [onTheme, prefs.readingTheme]);
  const versions = useMemo(
    () => Object.fromEntries(translations.map((t) => [t.id, t.dataVersion])),
    [translations],
  );
  const ids = prefs.parallel ? prefs.translations : [prefs.translations[0]];
  const idsKey = ids.join(",");
  const load = useCallback(async () => {
    setStarting(true);
    setError("");
    try {
      const a = await getAPI();
      const [ts, bs, p] = await Promise.all([
        a.ListTranslations(),
        a.ListBooks(["cuv", "webp"]),
        a.GetPreferences(),
      ]);
      setAPI(a);
      setTranslations(ts);
      setBooks(bs);
      setPrefs(p);
    } catch (e) {
      setError(errorText(e, currentPrefs.current.uiLanguage));
    } finally {
      setStarting(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!api || starting) return;
    const n = ++request.current;
    setBusy(true);
    setError("");
    setAnnotationError("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const wanted = currentPrefs.current;
    api
      .GetChapter(idsKey.split(","), prefs.bookId, prefs.chapter, String(n))
      .then(async (value) => {
        if (n !== request.current) return;
        setChapter(value);
        setHighlights([]);
        try {
          const h = await api.ListHighlights(
            idsKey.split(","),
            value.book.id,
            value.chapter,
          );
          if (n === request.current) setHighlights(h);
        } catch (e) {
          if (n === request.current)
            setAnnotationError(errorText(e, currentPrefs.current.uiLanguage));
        }
        if (n !== request.current) return;
        restoring.current = true;
        requestAnimationFrame(() => {
          if (!scroll.current) return;
          const target = Array.from(
            scroll.current.querySelectorAll<HTMLElement>("[data-row]"),
          ).find((x) => x.dataset.row === wanted.topVerse);
          scroll.current.scrollTop = target
            ? target.offsetTop - scroll.current.offsetTop + wanted.scrollOffset
            : 0;
          restoring.current = false;
        });
      })
      .catch((e) => {
        if (n === request.current) {
          setChapter(undefined);
          setError(errorText(e, currentPrefs.current.uiLanguage));
        }
      })
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
  }, [api, starting, prefs.bookId, prefs.chapter, idsKey, retry]);
  useEffect(() => {
    if (!api || starting) return;
    const n = ++persistRequest.current;
    const timer = setTimeout(() => {
      if (smokeActive.current) return;
      api.SavePreferences(prefs).catch((e) => {
        if (n === persistRequest.current)
          setAnnotationError(errorText(e, currentPrefs.current.uiLanguage));
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [api, prefs, starting]);
  useEffect(() => {
    document
      .querySelector<HTMLElement>('.chapter-button[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    document
      .querySelector<HTMLElement>('.book-button[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [prefs.bookId, prefs.chapter, prefs.globalFontSize, searching]);
  const navigate = useCallback((bookId: string, ch: number) => {
    setSearchTarget(undefined);
    setStudyVerse(null);
    setPrefs((p) => ({
      ...p,
      bookId,
      chapter: ch,
      topVerse: "",
      scrollOffset: 0,
    }));
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        busy ||
        starting ||
        settings ||
        searching ||
        studyVerse ||
        card ||
        window.getSelection()?.isCollapsed === false ||
        target?.closest(
          "input, textarea, select, [contenteditable], [role='combobox'], [role='dialog'], .ant-select, .chapter-nav, .selection-toolbar",
        )
      )
        return;
      const next = adjacentChapter(
        books,
        prefs.bookId,
        prefs.chapter,
        event.key === "ArrowRight" ? 1 : -1,
      );
      if (!next) return;
      event.preventDefault();
      navigate(next.bookId, next.chapter);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    books,
    prefs.bookId,
    prefs.chapter,
    busy,
    starting,
    settings,
    searching,
    studyVerse,
    card,
    navigate,
  ]);
  useEffect(() => {
    if (
      !searchTarget ||
      busy ||
      chapter?.book.id !== searchTarget.hit.bookId ||
      chapter.chapter !== searchTarget.hit.chapter
    )
      return;
    const timer = setTimeout(() => setSearchTarget(undefined), 5000);
    return () => clearTimeout(timer);
  }, [searchTarget, chapter, busy]);
  function placeToolbar(
    value: Selection,
    point?: { clientX: number; clientY: number },
  ) {
    const element = Array.from(
      scroll.current?.querySelectorAll<HTMLElement>("[data-verse-text]") ?? [],
    ).find(
      (element) =>
        element.dataset.translation === value.translationId &&
        element.dataset.verse === value.spans.at(-1)?.verseKey,
    );
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const browserSelection = window.getSelection();
    let endRect = rect;
    if (
      !point &&
      browserSelection?.focusNode &&
      !browserSelection.isCollapsed
    ) {
      const range = document.createRange();
      range.setStart(browserSelection.focusNode, browserSelection.focusOffset);
      range.collapse(true);
      endRect = range.getClientRects()[0] ?? rect;
    }
    setSelectionAnchor({
      element,
      top: rect.top,
      x: point?.clientX ?? Math.min(endRect.left + 100, endRect.right),
      y: point?.clientY ?? endRect.bottom,
    });
  }
  function selectText(point?: {
    clientX: number;
    clientY: number;
    target?: EventTarget | null;
  }) {
    if (!chapter || busy) return;
    if (
      point?.target instanceof Element &&
      point.target.closest(".verse-select")
    )
      return;
    try {
      const value = captureSelection(chapter, versions);
      if (value) {
        setSelection(value);
        placeToolbar(value, point);
      } else if (
        point &&
        !(
          point.target instanceof Element && point.target.closest(".verse-cell")
        )
      )
        setSelection(null);
    } catch (e) {
      setSelection(null);
      message.warning(errorText(e, prefs.uiLanguage));
    }
  }
  function selectVerse(
    id: string,
    label: string,
    shift: boolean,
    point?: { clientX: number; clientY: number },
  ) {
    if (!chapter) return;
    const from =
      shift && selection?.translationId === id
        ? selection.spans[0].verseKey
        : label;
    const value = wholeVerses(chapter, id, versions[id], from, label);
    setSelection(value);
    window.getSelection()?.removeAllRanges();
    placeToolbar(value, point);
  }
  const copy = useCallback(
    async (mode: string, value = selection) => {
      if (!api || !value) return;
      try {
        await api.CopySelection(value, mode, idsKey.split(","), {
          referencePosition: prefs.referencePosition,
          referenceStyle: prefs.referenceStyle,
          chapterNumerals: prefs.chapterNumerals,
          referenceBrackets: prefs.referenceBrackets,
          uiLanguage: prefs.uiLanguage,
        });
        message.success(
          translator(prefs.uiLanguage)("已复制经文", "Scripture copied"),
        );
      } catch (e) {
        message.error(errorText(e, prefs.uiLanguage));
      }
    },
    [
      api,
      selection,
      idsKey,
      prefs.referencePosition,
      prefs.referenceStyle,
      prefs.chapterNumerals,
      prefs.referenceBrackets,
      prefs.uiLanguage,
      message,
    ],
  );
  useEffect(() => {
    const interceptCopy = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, [contenteditable]:not([contenteditable='false'])",
        )
      )
        return;
      const browserSelection = window.getSelection();
      const start = browserSelection?.anchorNode;
      const element = start instanceof Element ? start : start?.parentElement;
      if (
        !element?.closest(".verses") &&
        !target?.closest(".verses, .selection-toolbar") &&
        (!selection || browserSelection?.isCollapsed === false)
      )
        return;
      event.preventDefault();
      try {
        const value = chapter && captureSelection(chapter, versions);
        if (!value && browserSelection && !browserSelection.isCollapsed)
          throw new Error("INVALID_SELECTION");
        if (value || selection)
          void copy("textWithReference", value || selection);
      } catch (error) {
        message.warning(errorText(error, prefs.uiLanguage));
      }
    };
    document.addEventListener("copy", interceptCopy);
    return () => document.removeEventListener("copy", interceptCopy);
  }, [chapter, versions, selection, copy, message, prefs.uiLanguage]);
  const quit = useCallback(async () => {
    if (!api || quitting.current) return;
    quitting.current = true;
    try {
      if (!(await saveAndQuit(api, currentPrefs.current)))
        message.info(
          translator(currentPrefs.current.uiLanguage)(
            "浏览器预览请直接关闭标签页",
            "Close this tab to leave the browser preview",
          ),
        );
    } catch (error) {
      message.error(errorText(error, currentPrefs.current.uiLanguage));
    } finally {
      quitting.current = false;
    }
  }, [api, message]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = commandShortcut(event);
      if (command === "search" && !card) {
        event.preventDefault();
        openSearch();
      }
      if (command === "quit") {
        event.preventDefault();
        void quit();
      }
      if (
        command === "copy" &&
        selection &&
        window.getSelection()?.isCollapsed !== false
      ) {
        const target = event.target instanceof Element ? event.target : null;
        if (
          !target?.closest(
            "input, textarea, [contenteditable]:not([contenteditable='false'])",
          )
        ) {
          event.preventDefault();
          void copy("textWithReference");
        }
      }
    };
    const nativeQuit = () => {
      void quit();
    };
    const nativeSearch = () => {
      if (!card) openSearch();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("bible:quit", nativeQuit);
    window.addEventListener("bible:search", nativeSearch);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("bible:quit", nativeQuit);
      window.removeEventListener("bible:search", nativeSearch);
    };
  }, [openSearch, quit, copy, selection, card]);
  async function paint(color: string) {
    if (!api || !selection) return;
    setPainting(true);
    try {
      const h = await api.ApplyHighlight(crypto.randomUUID(), selection, color);
      setHighlights((old) => [
        ...old.filter((v) => v.translationId !== selection.translationId),
        ...h,
      ]);
      setAnnotationError("");
      message.success(
        color
          ? t("高亮已保存", "Highlight saved")
          : t("高亮已清除", "Highlight cleared"),
      );
    } catch (e) {
      setAnnotationError(errorText(e, prefs.uiLanguage));
    } finally {
      setPainting(false);
    }
  }
  function onScroll() {
    if (restoring.current || !scroll.current) return;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!scroll.current) return;
      const rect = scroll.current.getBoundingClientRect();
      const rows = Array.from(
        scroll.current.querySelectorAll<HTMLElement>("[data-row]"),
      );
      const first = rows.find(
        (x) => x.getBoundingClientRect().bottom > rect.top,
      );
      if (first)
        setPrefs((p) => ({
          ...p,
          topVerse: first.dataset.row ?? "",
          scrollOffset: Math.max(
            0,
            rect.top - first.getBoundingClientRect().top,
          ),
        }));
    }, 250);
  }
  // Native CI traverses the real Go bridge and rendered Canvas, without claiming dialog automation.
  useEffect(() => {
    if (!api || starting || !translations.length) return;
    async function smoke() {
      if (smokeActive.current) return;
      smokeActive.current = true;
      let passed = false;
      try {
        const c = await api!.GetChapter(
          ["cuv", "webp"],
          "GEN",
          1,
          "native-smoke",
        );
        if (c.rows.length < 30) throw new Error("incomplete chapter");
        const found = await api!.SearchScripture("cuv", "起%神", 0, 30);
        if (
          !found.results.some(
            (hit) =>
              hit.bookId === "GEN" && hit.chapter === 1 && hit.verseKey === "1",
          )
        )
          throw new Error("scripture search");
        const hebrew = await api!.LookupWord("H430");
        const greek = await api!.LookupWord("G3056");
        const study = await api!.GetVerseWords("JHN", 1, "1");
        if (
          !hebrew.lemma ||
          !hebrew.chineseDefinition?.includes("神") ||
          !greek.chineseDefinition?.includes("話語") ||
          greek.lemma !== "λόγος" ||
          !study.entries.some((entry) => entry.id === "G3056")
        )
          throw new Error("original-language dictionary");
        const s = wholeVerses(c, "cuv", versions.cuv, "1");
        await api!.ApplyHighlight("native-smoke-highlight", s, "green");
        const hs = await api!.ListHighlights(["cuv"], "GEN", 1);
        if (!hs.some((h) => h.verseKey === "1" && h.color === "green"))
          throw new Error("highlight");
        const kjvChapter = await api!.GetChapter(
          ["cuv", "kjv", "webp"],
          "GEN",
          1,
          "native-kjv-smoke",
        );
        if (
          !kjvChapter.rows
            .find((row) => row.label === "1")
            ?.cells.some(
              (cell) =>
                cell.translationId === "kjv" &&
                cell.text.includes("the heaven and the earth"),
            )
        )
          throw new Error("KJV chapter");
        const previous = await api!.GetPreferences();
        await api!.SavePreferences({
          ...previous,
          referencePosition: "before",
          uiLanguage: "en",
          fontSize: 20,
          readingTheme: "paper",
        });
        const restored = await api!.GetPreferences();
        if (
          restored.uiLanguage !== "en" ||
          restored.referencePosition !== "before" ||
          restored.fontSize !== 20 ||
          restored.readingTheme !== "paper"
        )
          throw new Error("settings persistence");
        await api!.SavePreferences(previous);
        await api!.CopySelection(s, "parallelVerse", ["cuv", "kjv", "webp"], {
          referencePosition: "before",
          referenceStyle: "verses-short",
          uiLanguage: "en",
        });
        const content = await api!.GetCard(s, ["cuv", "kjv", "webp"], true, {
          referencePosition: "after",
          referenceStyle: "short",
          uiLanguage: "zh-CN",
        });
        if (
          content.lines.length !== 3 ||
          !content.lines.some((line) => line.version === "KJV")
        )
          throw new Error("KJV card");
        const image = document.createElement("canvas");
        await drawCard(image, content, {
          height: 1080,
          background: "#ffffff",
          color: "#263747",
          fontSize: 48,
          align: "left",
        });
        const saved = await api!.SaveCard(
          image.toDataURL("image/png").split(",")[1],
          1080,
          1080,
          "native-smoke-card",
          s,
        );
        if (!saved.saved) throw new Error("save");
        passed = true;
      } catch (e) {
        console.error("native smoke failed", e);
      } finally {
        const native = await import("./shared/native");
        try {
          await native.reportSmoke(passed, appVersion);
        } finally {
          smokeActive.current = false;
        }
      }
    }
    window.addEventListener("bible:native-smoke", smoke);
    if (new URLSearchParams(window.location.search).has("nativeSmoke"))
      void smoke();
    return () => window.removeEventListener("bible:native-smoke", smoke);
  }, [api, starting, translations, versions.cuv]);
  const stale = highlights.filter(
    (h) => h.dataVersion !== versions[h.translationId],
  ).length;
  if (starting)
    return (
      <div className="startup">
        <Spin size="large" />
        <p>{t("正在打开圣经…", "Opening Bible…")}</p>
      </div>
    );
  if (!api)
    return (
      <div className="startup">
        <Alert
          type="error"
          title={
            error || t("桌面服务未连接", "The desktop service is unavailable")
          }
          showIcon
          action={<Button onClick={load}>{t("重试", "Retry")}</Button>}
        />
      </div>
    );
  return (
    <div className={`reader-shell ${searching ? "has-search" : ""}`}>
      <aside className="sidebar" aria-label={t("书卷目录", "Books")}>
        <header className="brand">
          <img src="/bible.svg" alt="" />
          <div>
            <strong>{t("圣经", "Bible")}</strong>
            <span>BIBLE</span>
          </div>
          <span
            className="offline-dot"
            title={t("离线阅读", "Offline reading")}
          />
        </header>
        <div className="book-list">
          {(["OT", "NT"] as const).map((group) => (
            <section key={group}>
              <h2>
                {group === "OT"
                  ? t("旧约", "Old Testament")
                  : t("新约", "New Testament")}
                <span>
                  {prefs.uiLanguage !== "en" &&
                    (group === "OT" ? "OLD TESTAMENT" : "NEW TESTAMENT")}
                </span>
              </h2>
              {books
                .filter((b) => b.testament === group)
                .map((b) => (
                  <button
                    key={b.id}
                    className="book-button"
                    aria-current={prefs.bookId === b.id ? "page" : undefined}
                    onClick={() => navigate(b.id, 1)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const next =
                          books[
                            books.findIndex((x) => x.id === b.id) +
                              (e.key === "ArrowDown" ? 1 : -1)
                          ];
                        if (next) {
                          navigate(next.id, 1);
                          requestAnimationFrame(() =>
                            document
                              .querySelector<HTMLButtonElement>(
                                `[data-book="${next.id}"]`,
                              )
                              ?.focus(),
                          );
                        }
                      }
                    }}
                    data-book={b.id}
                  >
                    <span>
                      {prefs.uiLanguage === "en" ? b.englishName : b.name}
                    </span>
                    <span className="book-abbreviation">
                      {prefs.uiLanguage === "en" ? b.id : b.abbreviation}
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </div>
        <footer className="sidebar-footer">
          <span>{t("本地离线阅读", "Offline reading")}</span>
        </footer>
      </aside>
      <main className="reading-main">
        <header className="reader-toolbar">
          <div className="chapter-title">
            <h1>
              {prefs.uiLanguage === "en"
                ? books.find((b) => b.id === prefs.bookId)?.englishName
                : books.find((b) => b.id === prefs.bookId)?.name}
              {prefs.uiLanguage === "en" ? " " : ""}
              <span>
                {t(`第 ${prefs.chapter} 章`, `Chapter ${prefs.chapter}`)}
              </span>
            </h1>
            <p>
              {books.find((b) => b.id === prefs.bookId)?.englishName}{" "}
              <span>·</span>{" "}
              {prefs.parallel
                ? t("多译本对照", "Compare translations")
                : t("经文阅读", "Scripture reading")}
            </p>
          </div>
          <div className="reader-actions">
            <Button onClick={openSearch}>
              {t("经文搜索", "Search scripture")}
            </Button>
            <Button
              disabled={!chapter || busy}
              onClick={() => {
                setStudyVerse(
                  selection?.spans[0]?.verseKey ??
                    chapter?.rows[0]?.label ??
                    "1",
                );
                setSelection(null);
              }}
            >
              {t("原文字典", "Dictionary")}
            </Button>
            <Select
              aria-label={t("主译本", "Primary translation")}
              value={prefs.translations[0]}
              onChange={(id) =>
                setPrefs((p) => ({
                  ...p,
                  translations: [
                    id,
                    ...p.translations
                      .slice(1)
                      .map((other) =>
                        other === id ? p.translations[0] : other,
                      ),
                  ],
                }))
              }
              options={translations.map((t) => ({
                value: t.id,
                label: `${t.abbreviation} · ${t.language.startsWith("zh") ? "简体中文" : "English"}`,
              }))}
              style={{ width: 160 }}
            />
            {prefs.parallel && (
              <Select
                aria-label={t("对照译本", "Comparison translations")}
                mode="multiple"
                optionLabelProp="abbreviation"
                value={prefs.translations.slice(1)}
                onChange={(selected: string[]) =>
                  setPrefs((p) => ({
                    ...p,
                    translations: [p.translations[0], ...selected],
                    parallel: selected.length > 0,
                  }))
                }
                options={translations
                  .filter((t) => t.id !== prefs.translations[0])
                  .map((t) => ({
                    value: t.id,
                    abbreviation: t.abbreviation,
                    label: `${t.abbreviation} · ${t.language.startsWith("zh") ? "简体中文" : "English"}`,
                  }))}
                style={{ minWidth: 180, maxWidth: 260 }}
              />
            )}
            <label className="parallel-toggle">
              {t("多译本对照", "Compare")}
              <Switch
                checked={prefs.parallel}
                onChange={(v) =>
                  setPrefs((p) => ({
                    ...p,
                    parallel: v,
                    translations:
                      v && p.translations.length === 1
                        ? [
                            ...p.translations,
                            translations.find(
                              (translation) =>
                                translation.id !== p.translations[0],
                            )!.id,
                          ]
                        : p.translations,
                  }))
                }
              />
            </label>
            <Button
              onClick={() => {
                setSelection(null);
                setSettings(true);
              }}
            >
              {t("设置", "Settings")}
            </Button>
          </div>
        </header>
        <nav className="chapter-nav" aria-label={t("章节导航", "Chapters")}>
          <div className="chapter-strip">
            {Array.from(
              {
                length: books.find((b) => b.id === prefs.bookId)?.chapters ?? 0,
              },
              (_, i) => i + 1,
            ).map((n) => (
              <button
                className="chapter-button"
                aria-label={t(`第${n}章`, `Chapter ${n}`)}
                data-chapter={n}
                aria-current={n === prefs.chapter ? "page" : undefined}
                key={n}
                onClick={() => navigate(prefs.bookId, n)}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    const next = adjacentChapter(
                      books,
                      prefs.bookId,
                      n,
                      e.key === "ArrowRight" ? 1 : -1,
                    );
                    if (next) {
                      e.preventDefault();
                      navigate(next.bookId, next.chapter);
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            `.chapter-button[data-chapter="${next.chapter}"]`,
                          )
                          ?.focus(),
                      );
                    }
                  }
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </nav>
        {prototype && (
          <Alert
            className="prototype-banner"
            title={t(
              "产品原型 / 模拟数据 · 标记仅保存在浏览器中；尚未具备权限保护",
              "Prototype / Mock data · Annotations are stored in this browser; access controls are not implemented",
            )}
            type="warning"
          />
        )}
        {error && (
          <Alert
            title={error}
            type="error"
            showIcon
            action={
              <Button onClick={() => setRetry((n) => n + 1)}>
                {t("重试", "Retry")}
              </Button>
            }
          />
        )}
        {annotationError && (
          <Alert
            title={annotationError}
            type="error"
            showIcon
            action={
              <Button onClick={() => setRetry((n) => n + 1)}>
                {t("重试读取", "Retry loading")}
              </Button>
            }
            closable
            onClose={() => setAnnotationError("")}
          />
        )}
        {stale > 0 && (
          <Alert
            type="warning"
            title={t(
              `有 ${stale} 条标记属于其他经文版本，已保留原记录，请核对后重新标记。`,
              `${stale} annotations belong to another scripture version. Original records have been retained; review before highlighting again.`,
            )}
          />
        )}
        <div className="version-headings">
          {ids.map((id) => (
            <div key={id}>
              <strong>{translations.find((t) => t.id === id)?.name}</strong>
              <span>{translations.find((t) => t.id === id)?.abbreviation}</span>
            </div>
          ))}
        </div>
        <div className="reading-content">
          <div
            className="verse-scroll"
            ref={scroll}
            onScroll={onScroll}
            aria-busy={busy}
          >
            <Spin spinning={busy}>
              <div
                className="verses"
                style={{
                  fontSize: (prefs.fontSize * prefs.globalFontSize) / 13,
                }}
                onMouseUp={selectText}
                onClick={(e) => {
                  const cell = (e.target as Element).closest(".verse-cell");
                  if (searching && cell)
                    closeSearch(
                      cell.closest<HTMLElement>("[data-row]") ?? undefined,
                    );
                }}
                onKeyUp={(e) => {
                  if (e.key === "Shift" || e.shiftKey) selectText();
                }}
              >
                {chapter?.rows.map((row) => (
                  <div
                    key={row.label}
                    className={`verse-row ${searchTarget && chapter.book.id === searchTarget.hit.bookId && chapter.chapter === searchTarget.hit.chapter && row.label === searchTarget.hit.verseKey ? "is-search-target" : ""}`}
                    data-row={row.label}
                  >
                    {row.cells.map((cell) => (
                      <div
                        key={cell.translationId}
                        tabIndex={-1}
                        onMouseDown={(event) => {
                          if (event.shiftKey && event.button === 0)
                            event.preventDefault();
                        }}
                        onClick={(event) => {
                          const target = event.target as Element;
                          if (
                            busy ||
                            cell.missing ||
                            event.button !== 0 ||
                            event.detail > 1 ||
                            event.ctrlKey ||
                            event.metaKey ||
                            event.altKey ||
                            target.closest(
                              "button, a, input, textarea, select",
                            ) ||
                            window.getSelection()?.isCollapsed === false
                          )
                            return;
                          event.currentTarget.focus({ preventScroll: true });
                          selectVerse(
                            cell.translationId,
                            row.label,
                            event.shiftKey,
                            event,
                          );
                        }}
                        className={`verse-cell ${translations.find((t) => t.id === cell.translationId)?.language.startsWith("en") ? "english" : ""} ${selection?.translationId === cell.translationId && selection.spans.some((p) => p.verseKey === row.label) ? "is-selected" : ""}`}
                      >
                        <button
                          className="verse-select"
                          title={t(
                            "选择整段；Shift 选择连续经文",
                            "Select this passage; Shift-click for a range",
                          )}
                          aria-label={t(
                            `选择${cell.translationId === "cuv" ? "中文" : translations.find((t) => t.id === cell.translationId)?.abbreviation}第${row.label}节`,
                            `Select ${translations.find((t) => t.id === cell.translationId)?.abbreviation} verse ${row.label}`,
                          )}
                          disabled={cell.missing || busy}
                          onClick={(e) =>
                            selectVerse(
                              cell.translationId,
                              row.label,
                              e.shiftKey,
                              e.detail ? e : undefined,
                            )
                          }
                        >
                          {row.label}
                        </button>
                        {cell.missing ? (
                          <span className="missing-verse">
                            {t(
                              "本译本无此节",
                              "Verse not present in this translation",
                            )}
                          </span>
                        ) : (
                          <span
                            data-verse-text
                            data-translation={cell.translationId}
                            data-verse={row.label}
                          >
                            <MarkedText
                              text={cell.text}
                              pattern={
                                searchTarget &&
                                chapter.book.id === searchTarget.hit.bookId &&
                                chapter.chapter === searchTarget.hit.chapter &&
                                row.label === searchTarget.hit.verseKey &&
                                cell.translationId ===
                                  searchTarget.hit.translationId
                                  ? searchTarget.pattern
                                  : undefined
                              }
                              marks={highlights.filter(
                                (h) =>
                                  h.translationId === cell.translationId &&
                                  h.verseKey === row.label &&
                                  h.dataVersion === versions[h.translationId],
                              )}
                            />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {!chapter && !busy && !error && (
                  <Empty
                    description={t("暂无经文", "No scripture available")}
                  />
                )}
              </div>
            </Spin>
          </div>
        </div>
        <footer className="reader-footer">
          <span>
            {chapter
              ? t(
                  `${ids.length} 个译本`,
                  `${ids.length} translation${ids.length > 1 ? "s" : ""}`,
                )
              : t("经文阅读", "Scripture reading")}
          </span>
          <span>
            {t(
              "单击经文选整节；拖选文字；Shift 连选；← / → 翻章",
              "Click a verse to select; drag for text; Shift for a range; ← / → chapters",
            )}
          </span>
          <Space size={4}>
            <Button
              type="text"
              size="small"
              disabled={!previousChapter || busy}
              onClick={() =>
                previousChapter &&
                navigate(previousChapter.bookId, previousChapter.chapter)
              }
            >
              {t("上一章", "Previous chapter")}
            </Button>
            <Button
              type="text"
              size="small"
              disabled={!nextChapter || busy}
              onClick={() =>
                nextChapter && navigate(nextChapter.bookId, nextChapter.chapter)
              }
            >
              {t("下一章", "Next chapter")}
            </Button>
          </Space>
        </footer>
      </main>
      {selection && selectionAnchor && (
        <SelectionToolbar
          anchor={selectionAnchor}
          label={t("经文选区操作", "Scripture selection actions")}
          onDismiss={dismissSelection}
        >
          <span className="selection-label">
            {t(
              `已选 ${selection.spans.length} 段`,
              `${selection.spans.length} selected`,
            )}
          </span>
          <div className="highlight-colors">
            {Object.entries(colors).map(([key, c]) => (
              <Tooltip key={key} title={t(c.name, key)}>
                <button
                  aria-label={t(`${c.name}高亮`, `${key} highlight`)}
                  className="color-swatch"
                  disabled={painting}
                  style={{ background: c.value }}
                  onClick={() => paint(key)}
                />
              </Tooltip>
            ))}
          </div>
          <Button size="small" loading={painting} onClick={() => paint("")}>
            {t("清除高亮", "Clear highlight")}
          </Button>
          <Dropdown.Button
            size="small"
            style={{ width: "auto", flex: "0 0 auto" }}
            onClick={() => copy("textWithReference")}
            menu={{
              items: [
                {
                  key: "parallelVerse",
                  label: t("复制当前对照", "Copy comparison"),
                  disabled: ids.length < 2,
                },
              ],
              onClick: ({ key }) => copy(key),
            }}
          >
            {t("复制", "Copy")}
          </Dropdown.Button>
          <Button
            type="primary"
            size="small"
            onClick={() => setCard(selection)}
          >
            {t("制作卡片", "Create card")}
          </Button>
          <Button
            size="small"
            onClick={() => {
              setStudyVerse(selection.spans[0].verseKey);
              setSelection(null);
            }}
          >
            {t("原文注解", "Word study")}
          </Button>
          <Button
            type="text"
            size="small"
            aria-label={t("关闭选区操作", "Close selection actions")}
            onClick={() => setSelection(null)}
          >
            ×
          </Button>
        </SelectionToolbar>
      )}
      {card && (
        <CardEditor
          api={api}
          selection={card}
          translations={translations}
          comparison={ids}
          language={prefs.uiLanguage}
          formatOptions={prefs}
          onClose={() => setCard(null)}
        />
      )}
      {studyVerse && chapter && (
        <WordStudy
          api={api}
          book={chapter.book}
          chapter={chapter.chapter}
          initialVerse={studyVerse}
          verses={chapter.rows.map((row) => row.label)}
          language={prefs.uiLanguage}
          onClose={() => setStudyVerse(null)}
        />
      )}
      {searching && (
        <ScriptureSearch
          api={api}
          translations={translations}
          initialTranslation={prefs.translations[0]}
          focusRequest={searchFocus}
          language={prefs.uiLanguage}
          history={prefs.searchHistory}
          onRemember={remember}
          onClearHistory={clearSearchHistory}
          onClose={() => closeSearch()}
          onSelect={(hit, pattern) => {
            setSearchTarget({ hit, pattern });
            setSelection(null);
            setStudyVerse(null);
            setPrefs((p) => ({
              ...p,
              bookId: hit.bookId,
              chapter: hit.chapter,
              topVerse: hit.verseKey,
              scrollOffset: 0,
              translations: [
                hit.translationId,
                ...p.translations
                  .slice(1)
                  .map((id) =>
                    id === hit.translationId ? p.translations[0] : id,
                  ),
              ],
            }));
            setRetry((n) => n + 1);
          }}
        />
      )}
      {settings && (
        <Settings
          api={api}
          preview={
            chapter && {
              book: chapter.book,
              chapter: chapter.chapter,
              translation: translations.find((t) => t.id === ids[0])!,
              verses: chapter.rows.slice(0, 2).flatMap((row) => {
                const cell = row.cells.find(
                  (cell) => cell.translationId === ids[0],
                );
                return cell && !cell.missing
                  ? [{ label: row.label, text: cell.text }]
                  : [];
              }),
            }
          }
          preferences={prefs}
          translations={translations}
          onChange={(value) => setPrefs((p) => ({ ...p, ...value }))}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
export default function BibleApp() {
  const [language, setLanguage] = useState<Language>("zh-CN");
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>("light");
  const [globalFontSize, setGlobalFontSize] = useState(defaults.globalFontSize);
  const palette = palettes[readingTheme];
  return (
    <ConfigProvider
      locale={language === "en" ? enUS : zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm:
          readingTheme === "night"
            ? antTheme.darkAlgorithm
            : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: palette.primary,
          colorBgBase: palette.page,
          colorBgContainer: palette.raised,
          colorBgElevated: palette.raised,
          colorText: palette.text,
          colorTextSecondary: palette.secondary,
          colorBorder: palette.border,
          borderRadius: 5,
          fontSize: globalFontSize,
          fontFamily: '"Bible Sans", sans-serif',
          controlHeight: Math.round((32 * globalFontSize) / 13),
          controlHeightSM: Math.round((24 * globalFontSize) / 13),
        },
      }}
    >
      <AntApp>
        <Reader
          onLanguage={setLanguage}
          onTheme={setReadingTheme}
          onGlobalFontSize={setGlobalFontSize}
        />
      </AntApp>
    </ConfigProvider>
  );
}
