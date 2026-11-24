import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, InputNumber, Select, Space } from "antd";
import type { API, Book, Translation } from "../../shared/types";
import { ReferenceOptions } from "../../shared/ReferenceOptions";
import { referenceStyles } from "../../shared/formatting";
import { translator, type Language } from "../../shared/locale";
import { ProjectionBoard } from "./ProjectionBoard";
import {
  pageCount,
  projectionPassages,
  splitProjectionReferences,
  type ProjectionStyle,
} from "./model";
import { applyProjectionTheme, projectionThemes } from "./themes";
import { PassagePicker } from "./PassagePicker";
import { useProjection } from "./useProjection";

export function ProjectionControls({
  api,
  open,
  focusRequest,
  initialReference,
  initialTranslation,
  translations,
  books,
  style,
  language,
  onStyle,
  onClose,
}: {
  api: API;
  open: boolean;
  focusRequest: number;
  initialReference: string;
  initialTranslation: string;
  translations: Translation[];
  books: Book[];
  style: ProjectionStyle;
  language: Language;
  onStyle: (style: ProjectionStyle) => void;
  onClose: () => void;
}) {
  const t = translator(language);
  const [translation, setTranslation] = useState(initialTranslation);
  useEffect(() => {
    setTranslation(initialTranslation);
  }, [initialTranslation]);
  const [projectionBooks, setProjectionBooks] = useState(books),
    [bookLoading, setBookLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBookLoading(true);
    void api
      .ListBooks([translation])
      .then((value) => {
        if (live) setProjectionBooks(value);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBookLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, open, translation, translations]);
  const [publishing, setPublishing] = useState(false);
  const [drafts, setDrafts] = useState<
    Array<{ id: number; reference: string }>
  >([]);
  const draftID = useRef(0);
  const [entryReady, setEntryReady] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const { state, error: loadError } = useProjection(api);
  const run = (work: () => Promise<unknown>) => {
    queue.current = queue.current
      .catch(() => {})
      .then(work)
      .then(
        () => setError(""),
        (e) => setError(e instanceof Error ? e.message : String(e)),
      );
    return queue.current;
  };
  const change = (patch: Partial<ProjectionStyle>) => {
    const next = { ...style, ...patch, uiLanguage: language };
    if (
      !patch.themeId &&
      (patch.backgroundColor || patch.textColor || patch.alignment)
    )
      next.themeId = "custom";
    onStyle(next);
    run(() => api.SetProjection("", "", next));
  };
  const project = (value: string) => {
    if (publishing) return;
    if (!value.trim()) {
      setError(
        t("请输入卷章节，例如 创3:15-16", "Enter a reference, e.g. GEN3:15-16"),
      );
      return;
    }
    setPublishing(true);
    return run(async () => {
      await api.SetProjection(value, translation, {
        ...style,
        uiLanguage: language,
      });
      await api.ProjectionWindow("show");
    }).finally(() => setPublishing(false));
  };
  const add = (value: string) => {
    try {
      const references = splitProjectionReferences(value);
      if (drafts.length + references.length > 12)
        throw new Error(
          t(
            "投影清单最多12段经文",
            "The projection list supports up to 12 passages",
          ),
        );
      const additions = references.map((reference) => ({
        id: ++draftID.current,
        reference,
      }));
      setDrafts((current) => [...current, ...additions]);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const move = (index: number, direction: number) => {
    setDrafts((current) => {
      const next = [...current],
        target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const count = pageCount(state);
  const multiple = drafts.length > 1 || projectionPassages(state).length > 1;
  return (
    <Drawer
      open={open}
      title={t("经文投影 · F8", "Scripture projection · F8")}
      size={620}
      onClose={onClose}
      className="projection-controls"
      afterOpenChange={(visible) => {
        setEntryReady(visible);
      }}
    >
      <p className="projection-hint">
        {t(
          "输入卷章节并回车投放。投影窗口可拖到第二屏，F11 全屏，Esc 返回窗口。",
          "Enter a reference to project. Move the audience window to another display; F11 fullscreen, Esc windowed.",
        )}
      </p>
      <PassagePicker
        api={api}
        books={projectionBooks}
        translation={translation}
        language={language}
        onAdd={add}
        onProject={async (value) => {
          await project(value);
        }}
        disabled={drafts.length >= 12 || bookLoading}
        active={open && entryReady}
        focusRequest={focusRequest}
        initialReference={initialReference}
        publishing={publishing}
      />
      <label>
        {t("投影译本", "Projection translation")}
        <Select
          aria-label={t("投影译本", "Projection translation")}
          value={translation}
          onChange={setTranslation}
          options={translations.map((v) => ({
            value: v.id,
            label: `${v.abbreviation} · ${v.name}`,
          }))}
        />
      </label>
      {drafts.length > 0 && (
        <section
          className="projection-drafts"
          aria-label={t("投影清单", "Projection list")}
        >
          <div className="projection-list-heading">
            <strong>
              {t("投影清单", "Projection list")} ({drafts.length}/12)
            </strong>
            <Button size="small" onClick={() => setDrafts([])}>
              {t("清空清单", "Clear list")}
            </Button>
          </div>
          <ol>
            {drafts.map((draft, index) => (
              <li key={draft.id}>
                <span>{draft.reference}</span>
                <Space size={4}>
                  <Button
                    size="small"
                    aria-label={t(
                      `上移第${index + 1}段`,
                      `Move passage ${index + 1} up`,
                    )}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="small"
                    aria-label={t(
                      `下移第${index + 1}段`,
                      `Move passage ${index + 1} down`,
                    )}
                    disabled={index === drafts.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="small"
                    aria-label={t(
                      `移除第${index + 1}段`,
                      `Remove passage ${index + 1}`,
                    )}
                    onClick={() =>
                      setDrafts((current) =>
                        current.filter((d) => d.id !== draft.id),
                      )
                    }
                  >
                    ×
                  </Button>
                </Space>
              </li>
            ))}
          </ol>
          <Button
            type="primary"
            loading={publishing}
            aria-label={t("投放清单", "Project list")}
            onClick={() => project(drafts.map((d) => d.reference).join(";"))}
          >
            {t("投放清单", "Project list")}
          </Button>
          <p className="projection-hint">
            {t(
              "同屏显示多段，每段保留出处；清单修改在投放后生效。",
              "Passages share the screen with individual citations. List edits take effect when projected.",
            )}
          </p>
        </section>
      )}
      {(error || loadError) && (
        <Alert role="alert" type="error" showIcon title={error || loadError} />
      )}
      <div
        className="projection-preview"
        aria-label={t("投影预览", "Projection preview")}
      >
        <ProjectionBoard state={state} />
      </div>
      <div className="projection-paging">
        <Button
          disabled={!state.passage || state.pageIndex === 0}
          onClick={() => run(() => api.ControlProjection("previous"))}
        >
          {t("上一页", "Previous page")}
        </Button>
        <span aria-live="polite">
          {state.pageIndex + 1} / {count}
        </span>
        <Button
          disabled={!state.passage || state.pageIndex >= count - 1}
          onClick={() => run(() => api.ControlProjection("next"))}
        >
          {t("下一页", "Next page")}
        </Button>
      </div>
      <Space wrap>
        <Button
          disabled={!state.passage}
          onClick={() => run(() => api.ControlProjection("blank"))}
        >
          {state.blank
            ? t("恢复画面", "Resume")
            : t("暂时黑屏", "Blank screen")}
        </Button>
        <Button
          disabled={!state.passage}
          onClick={() => run(() => api.ProjectionWindow("fullscreen"))}
        >
          {t("投影全屏", "Fullscreen")}
        </Button>
        <Button
          disabled={!state.passage}
          onClick={() => run(() => api.ProjectionWindow("window"))}
        >
          {t("窗口显示", "Windowed")}
        </Button>
        <Button onClick={() => run(() => api.ProjectionWindow("stop"))}>
          {t("停止投影", "Stop projection")}
        </Button>
      </Space>
      <p className="projection-hint">
        {t(
          "投影窗口：← / → 翻页，B 黑屏／恢复，F8 返回控制。字号为上限，长经文会自动缩小。",
          "Audience: ← / → pages, B blank/resume, F8 controls. Long passages shrink to fit within the chosen font size.",
        )}
      </p>
      <div className="projection-fields">
        <label>
          {t("投影字号", "Projection font size")}
          <InputNumber
            aria-label={t("投影字号", "Projection font size")}
            min={24}
            max={120}
            precision={0}
            value={style.fontSize}
            onChange={(n) => {
              if (n && n >= 24 && n <= 120) change({ fontSize: n });
            }}
          />
        </label>
        <label>
          {multiple
            ? t("每段每页经节", "Verses per passage per page")
            : t("每页经节", "Verses per page")}
          <Select
            aria-label={
              multiple
                ? t("每段每页经节", "Verses per passage per page")
                : t("每页经节", "Verses per page")
            }
            value={style.versesPerPage}
            options={[1, 2, 3, 4, 5, 6].map((n) => ({
              value: n,
              label: String(n),
            }))}
            onChange={(versesPerPage) => change({ versesPerPage })}
          />
        </label>
        <label>
          {t("背景颜色", "Background color")}
          <input
            type="color"
            aria-label={t("背景颜色", "Background color")}
            value={style.backgroundColor}
            onChange={(e) => change({ backgroundColor: e.target.value })}
          />
        </label>
        <label>
          {t("文字颜色", "Text color")}
          <input
            type="color"
            aria-label={t("文字颜色", "Text color")}
            value={style.textColor}
            onChange={(e) => change({ textColor: e.target.value })}
          />
        </label>
        <label>
          {t("投影主题", "Projection theme")}
          <Select
            aria-label={t("投影主题", "Projection theme")}
            value={style.themeId || "custom"}
            options={[
              ...projectionThemes.map((theme) => ({
                value: theme.id,
                label: t(theme.zh, theme.en),
              })),
              { value: "custom", label: t("自定义", "Custom") },
            ]}
            onChange={(id) => change(applyProjectionTheme(style, id))}
            optionRender={(option) => {
              const theme = projectionThemes.find(
                (theme) => theme.id === option.value,
              );
              return (
                <span className="projection-theme-option">
                  {theme && (
                    <i
                      style={{
                        background: theme.backgroundColor,
                        color: theme.textColor,
                      }}
                    >
                      Aa
                    </i>
                  )}
                  <span>{option.label}</span>
                </span>
              );
            }}
          />
        </label>
        <label>
          {t("对齐", "Alignment")}
          <Select
            aria-label={t("投影对齐", "Projection alignment")}
            value={style.alignment}
            options={[
              { value: "left", label: t("左对齐", "Left") },
              { value: "center", label: t("居中", "Center") },
              { value: "right", label: t("右对齐", "Right") },
            ]}
            onChange={(alignment) => change({ alignment })}
          />
        </label>
        <label>
          {t("经文样式", "Scripture style")}
          <Select
            aria-label={t("投影经文样式", "Projection scripture style")}
            value={style.referenceStyle}
            options={referenceStyles.map((s) => ({
              value: s.value,
              label: t(s.zh, s.en),
            }))}
            onChange={(referenceStyle) => change({ referenceStyle })}
          />
        </label>
        <label>
          {t("出处位置", "Reference position")}
          <Select
            aria-label={t("投影出处位置", "Projection reference position")}
            value={style.referencePosition}
            options={[
              { value: "before", label: t("经文之前", "Before") },
              { value: "after", label: t("经文之后", "After") },
            ]}
            onChange={(referencePosition) => change({ referencePosition })}
          />
        </label>
        <ReferenceOptions
          options={style}
          language={language}
          onChange={change}
        />
      </div>
      <div
        className="projection-theme-choices"
        role="group"
        aria-label={t("主题预览", "Theme previews")}
      >
        {projectionThemes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            aria-label={t(`${theme.zh}主题`, `${theme.en} theme`)}
            aria-pressed={style.themeId === theme.id}
            style={{
              background: theme.backgroundColor,
              color: theme.textColor,
            }}
            onClick={() => change(applyProjectionTheme(style, theme.id))}
          >
            <span>{t("经文", "Scripture")}</span>
            <small>{t(theme.zh, theme.en)}</small>
          </button>
        ))}
      </div>
    </Drawer>
  );
}
