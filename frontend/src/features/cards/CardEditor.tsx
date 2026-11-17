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
  onClose,
}: {
  api: API;
  selection: Selection;
  translations: Translation[];
  comparison: string[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
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
      if (result.saved) message.success(`已保存 ${result.fileName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      title="制作经文卡片"
      width={920}
      onCancel={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button
            aria-label="关闭卡片编辑器"
            onClick={onClose}
            disabled={saving}
          >
            关闭
          </Button>
          <Button
            type="primary"
            onClick={save}
            loading={saving}
            disabled={!ready}
          >
            导出 PNG
          </Button>
        </>
      }
      maskClosable={false}
    >
      <div className="card-editor">
        <div className="card-controls">
          <label>
            经文语言
            <Select
              aria-label="卡片语言"
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
                {
                  value: "both",
                  label: `当前对照 · ${comparison.map((id) => translations.find((translation) => translation.id === id)?.abbreviation).join(" + ")}`,
                },
              ]}
            />
          </label>
          <label className="switch-label">
            使用完整经节
            <Switch
              checked={full || mode !== selection.translationId}
              disabled={mode !== selection.translationId}
              onChange={setFull}
            />
          </label>
          {mode !== selection.translationId && (
            <p className="muted">切换译本或对照卡片将采用完整经节。</p>
          )}
          <label>
            图片尺寸
            <Segmented
              block
              aria-label="图片尺寸"
              value={style.height}
              onChange={(v) => setStyle({ ...style, height: Number(v) })}
              options={[
                { label: "方图 1:1", value: 1080 },
                { label: "竖图 9:16", value: 1920 },
              ]}
            />
          </label>
          <label>
            模板
            <div className="template-choices">
              {templates.map((t) => (
                <Button
                  key={t.name}
                  onClick={() =>
                    setStyle({
                      ...style,
                      background: t.background,
                      color: t.color,
                    })
                  }
                >
                  {t.name}
                </Button>
              ))}
            </div>
          </label>
          <div className="color-controls">
            <label>
              底色
              <ColorPicker
                value={style.background}
                onChangeComplete={(v) =>
                  setStyle({ ...style, background: v.toHexString() })
                }
              />
            </label>
            <label>
              字色
              <ColorPicker
                value={style.color}
                onChangeComplete={(v) =>
                  setStyle({ ...style, color: v.toHexString() })
                }
              />
            </label>
          </div>
          <label>
            字号上限 · {style.fontSize}px
            <Slider
              aria-label="卡片字号"
              min={28}
              max={72}
              step={2}
              value={style.fontSize}
              onChange={(v) => setStyle({ ...style, fontSize: v })}
            />
          </label>
          <label>
            文字对齐
            <Segmented
              block
              value={style.align}
              onChange={(v) =>
                setStyle({ ...style, align: v as "left" | "center" })
              }
              options={[
                { label: "左对齐", value: "left" },
                { label: "居中", value: "center" },
              ]}
            />
          </label>
          <p className="muted">
            出处与译本将保留在图片中。预览与导出采用同一排版，文字不会被静默裁切。
          </p>
        </div>
        <div className="card-preview">
          <Spin spinning={loading}>
            <canvas
              ref={canvas}
              aria-label="经文卡片预览"
              style={{ opacity: ready ? 1 : 0.25 }}
            />
            <div className="preview-caption">
              1080 × {style.height} · PNG
              {content ? ` · ${content.codepoints} 字符` : ""}
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
