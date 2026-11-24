import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Space, Table, Tag } from "antd";
import type { API } from "../../shared/types";
import { errorText, translator } from "../../shared/locale";
import { prototype } from "../../shared/types";
import type { DownloadEdition, EditionInstall } from "./types";

export function DownloadCatalogue({
  api,
  language,
  query,
  filter,
  refresh,
  disabled,
  installs,
  renderActions,
  renderDetails,
  onDownload,
}: {
  api: API;
  language: "zh-CN" | "en";
  query: string;
  filter: string;
  refresh: number;
  disabled: boolean;
  installs: EditionInstall[];
  renderActions: (item: EditionInstall) => ReactNode;
  renderDetails: (item: EditionInstall) => ReactNode;
  onDownload: (id: string) => Promise<void>;
}) {
  const t = translator(language);
  const [modules, setModules] = useState<DownloadEdition[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void api
      .ListCrossWireEditions()
      .then((rows) => {
        if (active) setModules(rows);
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, refresh]);
  // Match retained source identity, even if a reader renamed the edition.
  const installed = (m: DownloadEdition) =>
    installs.filter(
      (item) =>
        item.report.format === "sword" &&
        item.report.metadata.DownloadURL ===
          `https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/${m.id}.zip`,
    );
  return (
    <section
      aria-label={t("CrossWire 下载列表", "CrossWire downloads")}
      className="edition-manager"
    >
      <p className="muted">
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
      {!!error && (
        <Alert type="error" title={errorText(error, language)} showIcon />
      )}
      <Table<DownloadEdition>
        size="small"
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 6, hideOnSinglePage: true }}
        locale={{ emptyText: t("没有符合条件的译本", "No matching editions") }}
        dataSource={modules.filter(
          (m) =>
            (!filter ||
              (filter === "en" ? m.language === "en" : m.language !== "en")) &&
            `${m.id} ${m.name}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )}
        expandable={{
          columnWidth: 70,
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              size="small"
              type="link"
              onClick={(e) => onExpand(record, e)}
              aria-expanded={expanded}
            >
              {expanded ? t("收起", "Collapse") : t("详情", "Details")}
            </Button>
          ),
          expandedRowRender: (m) => (
            <div className="edition-manager">
              <p>
                {m.id} · {m.language} · {m.version}
              </p>
              <pre className="edition-notice">
                {m.license}
                {"\n"}
                {m.about}
              </pre>
              {!!m.size && (
                <p>
                  {t("来源标示的安装占用：", "Source-reported install size: ")}
                  {(m.size / 1048576).toFixed(2)} MiB
                </p>
              )}
              {installed(m).map((item) => (
                <div key={item.translation.id}>
                  <h4>{item.translation.name}</h4>
                  {renderDetails(item)}
                </div>
              ))}
            </div>
          ),
        }}
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
                {installed(m).map((item) => (
                  <Tag
                    key={item.translation.id}
                    color={item.enabled ? "success" : "default"}
                  >
                    {item.removing
                      ? t("删除待重试", "Removal pending")
                      : item.enabled
                        ? t("已安装", "Installed")
                        : t("已停用", "Disabled")}
                    {item.report.sourceEdition &&
                      ` · ${item.report.sourceEdition}`}
                  </Tag>
                ))}
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
            width: "36%",
            render: (_, m) => (
              <Space orientation="vertical" size="small">
                {installed(m).map((item) => (
                  <div key={item.translation.id}>{renderActions(item)}</div>
                ))}
                {!installed(m).some(
                  (item) =>
                    !item.removing && item.report.sourceEdition === m.version,
                ) && (
                  <Button
                    size="small"
                    type="primary"
                    aria-label={
                      installed(m).length
                        ? t("下载此版", "Download this version")
                        : t("下载", "Download")
                    }
                    disabled={!m.supported || disabled || !!busy}
                    loading={busy === m.id}
                    onClick={() => {
                      setBusy(m.id);
                      setError(undefined);
                      void onDownload(m.id)
                        .catch((e) => setError(e))
                        .finally(() => setBusy(""));
                    }}
                  >
                    {installed(m).length
                      ? t("下载此版", "Download this version")
                      : t("下载", "Download")}
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
    </section>
  );
}
