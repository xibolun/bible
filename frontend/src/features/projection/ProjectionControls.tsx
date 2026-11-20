import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Input, InputNumber, Select, Space } from "antd";
import type { InputRef } from "antd";
import type { API, Translation } from "../../shared/types";
import { ReferenceOptions } from "../../shared/ReferenceOptions";
import { referenceStyles } from "../../shared/formatting";
import { translator, type Language } from "../../shared/locale";
import { ProjectionBoard } from "./ProjectionBoard";
import { pageCount, type ProjectionStyle } from "./model";
import { useProjection } from "./useProjection";

export function ProjectionControls({
  api,
  open,
  focusRequest,
  initialReference,
  initialTranslation,
  translations,
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
  style: ProjectionStyle;
  language: Language;
  onStyle: (style: ProjectionStyle) => void;
  onClose: () => void;
}) {
  const t = translator(language);
  const [reference, setReference] = useState(initialReference);
  const [translation, setTranslation] = useState(initialTranslation);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const input = useRef<InputRef>(null);
  const wasOpen = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const { state, error: loadError } = useProjection(api);
  useEffect(() => {
    if (open && !wasOpen.current)
      setReference(state.reference || initialReference);
    wasOpen.current = open;
  }, [open, initialReference, state.reference]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () => input.current?.focus({ cursor: "all" }),
      100,
    );
    return () => clearTimeout(timer);
  }, [open, focusRequest]);
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
    onStyle(next);
    run(() => api.SetProjection("", "", next));
  };
  const project = () => {
    if (publishing) return;
    if (!reference.trim()) {
      setError(
        t("请输入卷章节，例如 创3:15-16", "Enter a reference, e.g. GEN3:15-16"),
      );
      return;
    }
    setPublishing(true);
    void run(async () => {
      await api.SetProjection(reference, translation, {
        ...style,
        uiLanguage: language,
      });
      await api.ProjectionWindow("show");
    }).finally(() => setPublishing(false));
  };
  const count = pageCount(state);
  return (
    <Drawer
      open={open}
      title={t("经文投影 · F8", "Scripture projection · F8")}
      size={620}
      onClose={onClose}
      className="projection-controls"
      afterOpenChange={(visible) => {
        if (visible) input.current?.focus({ cursor: "all" });
      }}
    >
      <p className="projection-hint">
        {t(
          "输入卷章节并回车投放。投影窗口可拖到第二屏，F11 全屏，Esc 返回窗口。",
          "Enter a reference to project. Move the audience window to another display; F11 fullscreen, Esc windowed.",
        )}
      </p>
      <label>
        {t("快速经文", "Quick passage")}
        <Input.Search
          ref={input}
          aria-label={t("投影经文", "Projection reference")}
          placeholder="创3:15-16"
          value={reference}
          enterButton={
            <Button
              type="primary"
              aria-label={t("投放", "Project")}
              disabled={publishing}
            >
              {t("投放", "Project")}
            </Button>
          }
          loading={publishing}
          onChange={(e) => setReference(e.target.value)}
          onSearch={project}
        />
      </label>
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
          {t("每页经节", "Verses per page")}
          <Select
            aria-label={t("每页经节", "Verses per page")}
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
          {t("配色", "Palette")}
          <Select
            aria-label={t("投影配色", "Projection palette")}
            placeholder={t("选择配色", "Choose palette")}
            value={null}
            options={[
              { value: "white", label: t("白板", "Whiteboard") },
              { value: "dark", label: t("深色", "Dark") },
              { value: "warm", label: t("暖纸", "Warm paper") },
            ]}
            onChange={(v) =>
              change(
                v === "dark"
                  ? { backgroundColor: "#101820", textColor: "#ffffff" }
                  : v === "warm"
                    ? { backgroundColor: "#f4eddc", textColor: "#392f24" }
                    : { backgroundColor: "#ffffff", textColor: "#18212b" },
              )
            }
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
    </Drawer>
  );
}
