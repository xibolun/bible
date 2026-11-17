import { useCallback, useEffect, useRef, useState } from "react";
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
} from "antd";
import zhCN from "antd/locale/zh_CN";
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
  type Selection,
  type Translation,
} from "./shared/types";
import { captureSelection, wholeVerses } from "./shared/selection";
import { CardEditor } from "./features/cards/CardEditor";
import { drawCard } from "./features/cards/layout";

function MarkedText({ text, marks }: { text: string; marks: Highlight[] }) {
  const points = [...text];
  const pieces: React.ReactNode[] = [];
  let at = 0;
  for (const mark of [...marks].sort((a, b) => a.start - b.start)) {
    if (mark.start > at) pieces.push(points.slice(at, mark.start).join(""));
    pieces.push(
      <mark
        key={`${mark.start}-${mark.end}`}
        style={{ background: colors[mark.color]?.value }}
      >
        {points.slice(mark.start, mark.end).join("")}
      </mark>,
    );
    at = mark.end;
  }
  pieces.push(points.slice(at).join(""));
  return <>{pieces}</>;
}

function Reader() {
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
    [focus, setFocus] = useState(false),
    [card, setCard] = useState<Selection | null>(null),
    [about, setAbout] = useState(false),
    [retry, setRetry] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    request = useRef(0),
    scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    persistRequest = useRef(0),
    restoring = useRef(false);
  const currentPrefs = useRef(prefs);
  currentPrefs.current = prefs;
  const versions = Object.fromEntries(
    translations.map((t) => [t.id, t.dataVersion]),
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
      setError(e instanceof Error ? e.message : "启动失败，请重试");
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
            setAnnotationError(e instanceof Error ? e.message : "标记读取失败");
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
          setError(e instanceof Error ? e.message : "加载失败");
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
      api.SavePreferences(prefs).catch((e) => {
        if (n === persistRequest.current)
          setAnnotationError(e instanceof Error ? e.message : "偏好保存失败");
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
  }, [prefs.bookId, prefs.chapter, focus]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocus(false);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const navigate = (bookId: string, ch: number) => {
    setPrefs((p) => ({
      ...p,
      bookId,
      chapter: ch,
      topVerse: "",
      scrollOffset: 0,
    }));
  };
  function selectText() {
    if (!chapter || busy) return;
    try {
      const value = captureSelection(chapter, versions);
      if (value) setSelection(value);
    } catch (e) {
      message.warning(e instanceof Error ? e.message : "无效选区");
    }
  }
  function selectVerse(id: string, label: string, shift: boolean) {
    if (!chapter) return;
    const from =
      shift && selection?.translationId === id
        ? selection.spans[0].verseKey
        : label;
    setSelection(wholeVerses(chapter, id, versions[id], from, label));
    window.getSelection()?.removeAllRanges();
  }
  async function copy(mode: string) {
    if (!api || !selection) return;
    try {
      await api.CopySelection(selection, mode, prefs.translations);
      message.success("已复制经文");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "复制失败，请重试");
    }
  }
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
      message.success(color ? "高亮已保存" : "高亮已清除");
    } catch (e) {
      setAnnotationError(e instanceof Error ? e.message : "保存失败，请重试");
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
      let passed = false;
      try {
        const c = await api!.GetChapter(
          ["cuv", "webp"],
          "GEN",
          1,
          "native-smoke",
        );
        if (c.rows.length < 30) throw new Error("incomplete chapter");
        const s = wholeVerses(c, "cuv", versions.cuv, "1");
        await api!.ApplyHighlight("native-smoke-highlight", s, "green");
        const hs = await api!.ListHighlights(["cuv"], "GEN", 1);
        if (!hs.some((h) => h.verseKey === "1" && h.color === "green"))
          throw new Error("highlight");
        const kjvChapter = await api!.GetChapter(
          ["cuv", "kjv"],
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
        await api!.CopySelection(s, "parallelVerse", ["cuv", "kjv"]);
        const content = await api!.GetCard(s, ["cuv", "kjv"], true);
        if (!content.lines.some((line) => line.version === "KJV"))
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
        await native.reportSmoke(passed);
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
        <p>正在打开圣经…</p>
      </div>
    );
  if (!api)
    return (
      <div className="startup">
        <Alert
          type="error"
          title={error || "桌面服务未连接"}
          showIcon
          action={<Button onClick={load}>重试</Button>}
        />
      </div>
    );
  return (
    <div className={`reader-shell ${focus ? "is-focused" : ""}`}>
      {!focus && (
        <aside className="sidebar" aria-label="书卷目录">
          <header className="brand">
            <img src="/bible.svg" alt="" />
            <div>
              <strong>圣经</strong>
              <span>BIBLE</span>
            </div>
            <span className="offline-dot" title="离线阅读" />
          </header>
          <div className="book-list">
            {(["OT", "NT"] as const).map((group) => (
              <section key={group}>
                <h2>
                  {group === "OT" ? "旧约" : "新约"}
                  <span>
                    {group === "OT" ? "OLD TESTAMENT" : "NEW TESTAMENT"}
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
                      <span>{b.name}</span>
                      <span className="book-abbreviation">
                        {b.abbreviation}
                      </span>
                    </button>
                  ))}
              </section>
            ))}
          </div>
          <footer className="sidebar-footer">
            <span>本地离线阅读</span>
            <Button type="text" size="small" onClick={() => setAbout(!about)}>
              关于
            </Button>
          </footer>
        </aside>
      )}
      <main className="reading-main">
        <nav className="chapter-nav" aria-label="章节导航">
          <Button
            type="text"
            aria-label="向前滚动章号"
            onClick={() =>
              document
                .querySelector(".chapter-strip")
                ?.scrollBy({ left: -300, behavior: "smooth" })
            }
          >
            ‹
          </Button>
          <div className="chapter-strip">
            {Array.from(
              {
                length: books.find((b) => b.id === prefs.bookId)?.chapters ?? 0,
              },
              (_, i) => i + 1,
            ).map((n) => (
              <button
                className="chapter-button"
                aria-label={`第${n}章`}
                aria-current={n === prefs.chapter ? "page" : undefined}
                key={n}
                onClick={() => navigate(prefs.bookId, n)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    const next = n + (e.key === "ArrowRight" ? 1 : -1);
                    if (
                      next >= 1 &&
                      next <=
                        (books.find((b) => b.id === prefs.bookId)?.chapters ??
                          0)
                    ) {
                      e.preventDefault();
                      navigate(prefs.bookId, next);
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            `.chapter-button[aria-label="第${next}章"]`,
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
          <Button
            type="text"
            aria-label="向后滚动章号"
            onClick={() =>
              document
                .querySelector(".chapter-strip")
                ?.scrollBy({ left: 300, behavior: "smooth" })
            }
          >
            ›
          </Button>
        </nav>
        <header className="reader-toolbar">
          <div className="chapter-title">
            <h1>
              {books.find((b) => b.id === prefs.bookId)?.name}
              <span>第 {prefs.chapter} 章</span>
            </h1>
            <p>
              {books.find((b) => b.id === prefs.bookId)?.englishName}{" "}
              <span>·</span> {prefs.parallel ? "双译本对照" : "经文阅读"}
            </p>
          </div>
          <div className="reader-actions">
            {!focus && (
              <>
                <Select
                  aria-label="主译本"
                  value={prefs.translations[0]}
                  onChange={(id) =>
                    setPrefs((p) => ({
                      ...p,
                      translations: [
                        id,
                        p.translations[1] === id
                          ? p.translations[0]
                          : p.translations[1],
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
                    aria-label="对照译本"
                    value={prefs.translations[1]}
                    onChange={(id) =>
                      setPrefs((p) => ({
                        ...p,
                        translations: [p.translations[0], id],
                      }))
                    }
                    options={translations
                      .filter((t) => t.id !== prefs.translations[0])
                      .map((t) => ({
                        value: t.id,
                        label: `${t.abbreviation} · ${t.language.startsWith("zh") ? "简体中文" : "English"}`,
                      }))}
                    style={{ width: 160 }}
                  />
                )}
                <label className="parallel-toggle">
                  双译本对照
                  <Switch
                    checked={prefs.parallel}
                    onChange={(v) => setPrefs((p) => ({ ...p, parallel: v }))}
                  />
                </label>
                <div className="font-controls">
                  <Tooltip title="缩小字体">
                    <Button
                      aria-label="缩小字体"
                      disabled={prefs.fontSize <= 14}
                      onClick={() =>
                        setPrefs((p) => ({ ...p, fontSize: p.fontSize - 1 }))
                      }
                    >
                      A−
                    </Button>
                  </Tooltip>
                  <Tooltip title="放大字体">
                    <Button
                      aria-label="放大字体"
                      disabled={prefs.fontSize >= 32}
                      onClick={() =>
                        setPrefs((p) => ({ ...p, fontSize: p.fontSize + 1 }))
                      }
                    >
                      A＋
                    </Button>
                  </Tooltip>
                </div>
              </>
            )}
            <Button onClick={() => setFocus((v) => !v)}>
              {focus ? "退出专注 · Esc" : "专注阅读"}
            </Button>
          </div>
        </header>
        {prototype && (
          <Alert
            className="prototype-banner"
            title="产品原型 / 模拟数据 · 标记仅保存在浏览器中；尚未具备权限保护"
            type="warning"
          />
        )}
        {error && (
          <Alert
            title={error}
            type="error"
            showIcon
            action={
              <Button onClick={() => setRetry((n) => n + 1)}>重试</Button>
            }
          />
        )}
        {annotationError && (
          <Alert
            title={annotationError}
            type="error"
            showIcon
            action={
              <Button onClick={() => setRetry((n) => n + 1)}>重试读取</Button>
            }
            closable
            onClose={() => setAnnotationError("")}
          />
        )}
        {stale > 0 && (
          <Alert
            type="warning"
            title={`有 ${stale} 条标记属于其他经文版本，已保留原记录，请核对后重新标记。`}
          />
        )}
        <div className={`version-headings columns-${ids.length}`}>
          <div className="reference-heading">章:节</div>
          {ids.map((id) => (
            <div key={id}>
              <strong>{translations.find((t) => t.id === id)?.name}</strong>
              <span>{translations.find((t) => t.id === id)?.abbreviation}</span>
            </div>
          ))}
        </div>
        <div
          className="verse-scroll"
          ref={scroll}
          onScroll={onScroll}
          aria-busy={busy}
        >
          <Spin spinning={busy}>
            <div
              className="verses"
              style={{ fontSize: prefs.fontSize }}
              onMouseUp={selectText}
              onKeyUp={(e) => {
                if (e.key === "Shift") selectText();
              }}
              onCopy={(e) => {
                if (selection) {
                  e.preventDefault();
                  void copy("textWithReference");
                }
              }}
            >
              {chapter?.rows.map((row) => (
                <div
                  key={row.label}
                  className={`verse-row columns-${ids.length}`}
                  data-row={row.label}
                >
                  <span className="reference">
                    {prefs.chapter}:{row.label}
                  </span>
                  {row.cells.map((cell) => (
                    <div
                      key={cell.translationId}
                      className={`verse-cell ${translations.find((t) => t.id === cell.translationId)?.language.startsWith("en") ? "english" : ""} ${selection?.translationId === cell.translationId && selection.spans.some((p) => p.verseKey === row.label) ? "is-selected" : ""}`}
                    >
                      <button
                        className="verse-number"
                        title="点击选择整节；Shift 选择连续多节"
                        aria-label={`选择${cell.translationId === "cuv" ? "中文" : translations.find((t) => t.id === cell.translationId)?.abbreviation}第${row.label}节`}
                        disabled={cell.missing || busy}
                        onClick={(e) =>
                          selectVerse(cell.translationId, row.label, e.shiftKey)
                        }
                      >
                        {row.label}
                      </button>
                      {cell.missing ? (
                        <span className="missing-verse">本译本无此节</span>
                      ) : (
                        <span
                          data-verse-text
                          data-translation={cell.translationId}
                          data-verse={row.label}
                        >
                          <MarkedText
                            text={cell.text}
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
              {!chapter && !busy && !error && <Empty description="暂无经文" />}
            </div>
          </Spin>
        </div>
        <footer className="reader-footer">
          <span>
            {chapter
              ? `${chapter.rows.length} 节 · ${prefs.parallel ? "双译本对照" : "单译本"}`
              : "经文阅读"}
          </span>
          <span>拖动选择文字，或点击节号进行标记</span>
          <Space size={4}>
            <Button
              type="text"
              size="small"
              disabled={prefs.chapter <= 1 || busy}
              onClick={() => navigate(prefs.bookId, prefs.chapter - 1)}
            >
              ‹ 上一章
            </Button>
            <Button
              type="text"
              size="small"
              disabled={
                prefs.chapter >=
                  (books.find((b) => b.id === prefs.bookId)?.chapters ?? 1) ||
                busy
              }
              onClick={() => navigate(prefs.bookId, prefs.chapter + 1)}
            >
              下一章 ›
            </Button>
          </Space>
        </footer>
      </main>
      {selection && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="经文选区操作"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="selection-label">
            已选 {selection.spans.length} 节
          </span>
          <div className="highlight-colors">
            {Object.entries(colors).map(([key, c]) => (
              <Tooltip key={key} title={c.name}>
                <button
                  aria-label={`${c.name}高亮`}
                  className="color-swatch"
                  disabled={painting}
                  style={{ background: c.value }}
                  onClick={() => paint(key)}
                />
              </Tooltip>
            ))}
          </div>
          <Button size="small" loading={painting} onClick={() => paint("")}>
            清除高亮
          </Button>
          <Dropdown.Button
            size="small"
            onClick={() => copy("textWithReference")}
            menu={{
              items: [
                { key: "textOnly", label: "仅复制经文" },
                {
                  key: "parallelVerse",
                  label: "复制本节对照",
                  disabled: selection.spans.length !== 1,
                },
              ],
              onClick: ({ key }) => copy(key),
            }}
          >
            复制
          </Dropdown.Button>
          <Button
            type="primary"
            size="small"
            onClick={() => setCard(selection)}
          >
            制作卡片
          </Button>
          <Button
            type="text"
            size="small"
            aria-label="关闭选区操作"
            onClick={() => setSelection(null)}
          >
            ×
          </Button>
        </div>
      )}
      {card && (
        <CardEditor
          api={api}
          selection={card}
          translations={translations}
          comparison={prefs.translations}
          onClose={() => setCard(null)}
        />
      )}
      {about && (
        <div className="about-panel" role="dialog" aria-label="关于圣经">
          <Button
            className="about-close"
            type="text"
            onClick={() => setAbout(false)}
            aria-label="关闭关于"
          >
            ×
          </Button>
          <img src="/bible.svg" alt="" />
          <h2>圣经 · Bible</h2>
          <p>离线阅读、对照与经文卡片</p>
          {translations.map((t) => (
            <p key={t.id}>
              <strong>{t.name}</strong>
              <br />
              {t.license} · {t.abbreviation}
              <br />
              <small>{t.dataVersion}</small>
            </p>
          ))}
          <p className="muted">
            译文、字体与依赖来源见发行包 THIRD_PARTY_NOTICES。
          </p>
        </div>
      )}
    </div>
  );
}
export default function BibleApp() {
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: "#315f78",
          borderRadius: 5,
          fontSize: 13,
          fontFamily: '"Bible Sans", sans-serif',
          controlHeight: 32,
        },
      }}
    >
      <AntApp>
        <Reader />
      </AntApp>
    </ConfigProvider>
  );
}
