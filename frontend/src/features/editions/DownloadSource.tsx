import { useEffect, useState } from "react";
import { Alert, Button, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { API } from "../../shared/types";
import { errorText, translator } from "../../shared/locale";
import { prototype } from "../../shared/types";
import type { DownloadEdition } from "./types";

export function DownloadSource({
  api,
  language,
  onClose,
  onDownload,
}: {
  api: API;
  language: "zh-CN" | "en";
  onClose: () => void;
  onDownload: (id: string) => Promise<void>;
}) {
  const t = translator(language);
  const [modules, setModules] = useState<DownloadEdition[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("zh"),
    [details, setDetails] = useState<DownloadEdition>(),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .ListCrossWireEditions()
      .then((rows) => {
        if (active) setModules(rows);
      })
      .catch((e) => {
        if (active) setError(errorText(e, language));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, language, retry]);
  return (
    <Modal
      open
      title={t("下载译本 · CrossWire", "Download editions · CrossWire")}
      width={900}
      style={{ maxWidth: "calc(100vw - 32px)", top: 24 }}
      styles={{
        body: { maxHeight: "calc(100dvh - 180px)", overflowY: "auto" },
      }}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t("关闭", "Close")}</Button>}
    >
      <p>
        {t(
          "来源：CrossWire 官方圣经模块库。下载后先预览正文和版权说明，确认后保存在本机，供离线阅读。",
          "Source: CrossWire Bible module repository. Preview the text and notices before confirming local installation for offline reading.",
        )}
      </p>
      {prototype && (
        <Alert
          type="info"
          title={t(
            "浏览器模拟：列表与下载使用自编示例；真实下载请使用桌面应用。",
            "Browser Mock: the list and downloads use synthetic samples. Use the desktop app for real downloads.",
          )}
        />
      )}
      <Space wrap style={{ marginBlock: 12 }}>
        <Select
          aria-label={t("下载译本语言", "Download language")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "zh", label: t("中文", "Chinese") },
            { value: "en", label: t("英文", "English") },
          ]}
          style={{ width: 130 }}
        />
        <Input.Search
          aria-label={t("搜索下载译本", "Search downloadable editions")}
          placeholder={t(
            "搜索译本名称或简称",
            "Search edition name or abbreviation",
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          style={{ width: 260, maxWidth: "100%" }}
        />
        <Button loading={loading} onClick={() => setRetry((n) => n + 1)}>
          {t("刷新列表", "Refresh list")}
        </Button>
      </Space>
      {error && <Alert type="error" title={error} showIcon />}
      <Table<DownloadEdition>
        size="small"
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 6, hideOnSinglePage: true }}
        locale={{ emptyText: t("没有符合条件的译本", "No matching editions") }}
        dataSource={modules.filter(
          (m) =>
            (filter === "en" ? m.language === "en" : m.language !== "en") &&
            `${m.id} ${m.name}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )}
        columns={[
          {
            title: t("译本", "Edition"),
            render: (_, m) => (
              <>
                <strong>{m.name}</strong>
                <div className="muted">
                  {m.id} · {m.language} · {m.version}
                </div>
                <div className="muted">{m.license}</div>
                {!m.supported && (
                  <Tag>
                    {t("暂不兼容", "Unsupported")} ·{" "}
                    {errorText({ code: m.reason }, language)}
                  </Tag>
                )}
              </>
            ),
          },
          {
            title: t("操作", "Actions"),
            width: 160,
            render: (_, m) => (
              <Space wrap>
                <Button size="small" onClick={() => setDetails(m)}>
                  {t("详情", "Details")}
                </Button>
                <Button
                  size="small"
                  type="primary"
                  disabled={!m.supported || !!busy}
                  loading={busy === m.id}
                  onClick={() => {
                    setBusy(m.id);
                    setError("");
                    void onDownload(m.id)
                      .catch((e) => setError(errorText(e, language)))
                      .finally(() => setBusy(""));
                  }}
                >
                  {t("下载", "Download")}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={!!details}
        title={details?.name}
        onCancel={() => setDetails(undefined)}
        footer={
          <Button onClick={() => setDetails(undefined)}>
            {t("关闭详情", "Close details")}
          </Button>
        }
      >
        <p>
          {details?.id} · {details?.language} · {details?.version}
        </p>
        <p>{details?.license}</p>
        <pre className="edition-notice">{details?.about}</pre>
        {!!details?.size && (
          <p>
            {t("来源标示的安装占用：", "Source-reported install size: ")}
            {(details.size / 1048576).toFixed(2)} MiB
          </p>
        )}
      </Modal>
    </Modal>
  );
}
