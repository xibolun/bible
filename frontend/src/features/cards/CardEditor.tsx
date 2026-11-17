import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  ColorPicker,
  Modal,
  Segmented,
  Select,
  Slider,
  Spin,
  Switch,
} from "antd";
import type {
  API,
  CardContent,
  Selection,
  Translation,
} from "../../shared/types";
import { drawCard, type CardStyle } from "./layout";
import { translator, errorText, type Language } from "../../shared/locale";

const templates = [
  { name: "素白", background: "#f7f5ef", color: "#263747" },
  { name: "夜读", background: "#192d3d", color: "#f5f0e4" },
  { name: "暖笺", background: "#eee0cd", color: "#563d2d" },
];
export function CardEditor({
  api,
  selection,
  translations,
  comparison,
  language,
  onClose,
}: {
  api: API;
  selection: Selection;
  translations: Translation[];
  comparison: string[];
  language: Language;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const t = translator(language);
  const [mode, setMode] = useState(selection.translationId),
    [full, setFull] = useState(false),
    [content, setContent] = useState<CardContent>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false);
  const [style, setStyle] = useState<CardStyle>({
    height: 1080,
    background: templates[0].background,
    color: templates[0].color,
    fontSize: 48,
    align: "left",
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const idsKey = (mode === "both" ? comparison : [mode]).join(",");
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setReady(false);
    setError("");
    const ids = idsKey.split(",");
    api
      .GetCard(selection, ids, full || mode !== selection.translationId)
      .then((v) => {
        if (!cancel) setContent(v);
      })
      .catch((e) => {
        if (!cancel) {
          setContent(undefined);
          setError(String(e.message ?? e));
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [api, selection, mode, full, idsKey]);
  useEffect(() => {
    if (!content) return;
    let cancel = false;
    setReady(false);
    setError("");
    const temp = document.createElement("canvas");
    drawCard(temp, content, style)
      .then(() => {
        if (cancel || !canvas.current) return;
        canvas.current.width = temp.width;
        canvas.current.height = temp.height;
        canvas.current.getContext("2d")?.drawImage(temp, 0, 0);
        setReady(true);
      })
      .catch((e) => {
        if (!cancel) setError(e.message);
      });
    return () => {
      cancel = true;
    };
  }, [content, style]);
  async function save() {
    if (!canvas.current || !content || !ready) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.SaveCard(
        canvas.current.toDataURL("image/png").split(",")[1],
        1080,
        style.height,
        `${content.fileName}-1080x${style.height}`,
        selection,
      );
      if (result.saved)
        message.success(
          t(`已保存 ${result.fileName}`, `Saved ${result.fileName}`),
        );
    } catch (e) {
      setError(errorText(e, language));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      title={t("制作经文卡片", "Create scripture card")}
      width={920}
      onCancel={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button
            aria-label={t("关闭卡片编辑器", "Close card editor")}
            onClick={onClose}
            disabled={saving}
          >
            {t("关闭", "Close")}
          </Button>
          <Button
            type="primary"
            onClick={save}
            loading={saving}
            disabled={!ready}
          >
            {t("导出 PNG", "Export PNG")}
          </Button>
        </>
      }
      maskClosable={false}
    >
      <div className="card-editor">
        <div className="card-controls">
          <label>
            {t("经文译本", "Scripture translation")}
            <Select
              aria-label={t("卡片语言", "Card translation")}
              value={mode}
              onChange={(value) => {
                setReady(false);
                setMode(value);
              }}
              options={[
                ...translations.map((translation) => ({
                  value: translation.id,
                  label: `${translation.abbreviation} · ${translation.name}`,
                })),
                ...(comparison.length > 1
                  ? [
                      {
                        value: "both",
                        label: `${t("当前对照", "Current comparison")} · ${comparison.map((id) => translations.find((translation) => translation.id === id)?.abbreviation).join(" + ")}`,
                      },
                    ]
                  : []),
              ]}
            />
          </label>
          <label className="switch-label">
            {t("使用完整经节", "Use full verses")}
            <Switch
              checked={full || mode !== selection.translationId}
              disabled={mode !== selection.translationId}
              onChange={setFull}
            />
          </label>
          {mode !== selection.translationId && (
            <p className="muted">
              {t(
                "切换译本或对照卡片将采用完整经节。",
                "Changing translations or creating a comparison card uses full verses.",
              )}
            </p>
          )}
          <label>
            {t("图片尺寸", "Image size")}
            <Segmented
              block
              aria-label={t("图片尺寸", "Image size")}
              value={style.height}
              onChange={(v) => setStyle({ ...style, height: Number(v) })}
              options={[
                { label: t("方图 1:1", "Square 1:1"), value: 1080 },
                { label: t("竖图 9:16", "Portrait 9:16"), value: 1920 },
              ]}
            />
          </label>
          <label>
            {t("模板", "Template")}
            <div className="template-choices">
              {templates.map((template, index) => (
                <Button
                  key={template.name}
                  onClick={() =>
                    setStyle({
                      ...style,
                      background: template.background,
                      color: template.color,
                    })
                  }
                >
                  {t(template.name, ["Paper", "Night", "Warm"][index])}
                </Button>
              ))}
            </div>
          </label>
          <div className="color-controls">
            <label>
              {t("底色", "Background")}
              <ColorPicker
                value={style.background}
                onChangeComplete={(v) =>
                  setStyle({ ...style, background: v.toHexString() })
                }
              />
            </label>
            <label>
              {t("字色", "Text color")}
              <ColorPicker
                value={style.color}
                onChangeComplete={(v) =>
                  setStyle({ ...style, color: v.toHexString() })
                }
              />
            </label>
          </div>
          <label>
            {t("字号上限", "Maximum font size")} · {style.fontSize}px
            <Slider
              aria-label={t("卡片字号", "Card font size")}
              min={28}
              max={72}
              step={2}
              value={style.fontSize}
              onChange={(v) => setStyle({ ...style, fontSize: v })}
            />
          </label>
          <label>
            {t("文字对齐", "Text alignment")}
            <Segmented
              block
              value={style.align}
              onChange={(v) =>
                setStyle({ ...style, align: v as "left" | "center" })
              }
              options={[
                { label: t("左对齐", "Left"), value: "left" },
                { label: t("居中", "Center"), value: "center" },
              ]}
            />
          </label>
          <p className="muted">
            {t(
              "出处与译本将保留在图片中。预览与导出采用同一排版，文字不会被静默裁切。",
              "References and editions remain in the image. Preview and export share the same layout; text is never silently cropped.",
            )}
          </p>
        </div>
        <div className="card-preview">
          <Spin spinning={loading}>
            <canvas
              ref={canvas}
              aria-label={t("经文卡片预览", "Scripture card preview")}
              style={{ opacity: ready ? 1 : 0.25 }}
            />
            <div className="preview-caption">
              1080 × {style.height} · PNG
              {content
                ? ` · ${content.codepoints} ${t("字符", "characters")}`
                : ""}
            </div>
          </Spin>
        </div>
      </div>
      {error && (
        <Alert title={error} type="error" showIcon style={{ marginTop: 16 }} />
      )}
    </Modal>
  );
}
