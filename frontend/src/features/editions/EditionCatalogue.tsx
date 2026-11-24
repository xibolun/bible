import { useEffect, useState, type Key } from "react";
import {
  Alert,
  Button,
  Input,
  Progress,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { API, Translation } from "../../shared/types";
import { prototype } from "../../shared/types";
import { errorText, translator } from "../../shared/locale";
import type { DownloadEdition, EditionInstall } from "./types";
import { editionRows, newerVersion, type EditionRow } from "./catalogue";
import { EditionDetails, formatNames } from "./EditionDetails";
import { useEditionDownload } from "./useEditionDownload";

export function EditionCatalogue({
  api,
  language,
  translations,
  installs,
  loading,
  disabled,
  onImport,
  onReload,
  onInstalled,
  onRead,
  onToggle,
  onRemove,
  onRestore,
}: {
  api: API;
  language: "zh-CN" | "en";
  translations: Translation[];
  installs: EditionInstall[];
  loading: boolean;
  disabled: boolean;
  onImport: () => Promise<void>;
  onReload: () => Promise<void>;
  onInstalled: () => Promise<void>;
  onRead: (id: string) => Promise<void>;
  onToggle: (item: EditionInstall, enabled: boolean) => void;
  onRemove: (item: EditionInstall) => void;
  onRestore: (id: string, version: string) => Promise<boolean>;
}) {
  const t = translator(language);
  const [modules, setModules] = useState<DownloadEdition[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [remoteRequested, setRemoteRequested] = useState(false);
  const [sourceError, setSourceError] = useState<unknown>();
  const [actionError, setActionError] = useState<unknown>();
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState<readonly Key[]>([]);
  const download = useEditionDownload(api, onInstalled);
  const working = disabled || download.busy;
  useEffect(() => {
    if (!remoteRequested) return;
    let active = true;
    setSourceLoading(true);
    setSourceError(undefined);
    void api
      .ListCrossWireEditions()
      .then((rows) => {
        if (active) setModules(rows);
      })
      .catch((e) => {
        if (active) setSourceError(e);
      })
      .finally(() => {
        if (active) setSourceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, refresh, remoteRequested]);
  const rows = editionRows(translations, installs, modules).filter((row) => {
    // Keep an active task visible even if the reader changes the search.
    if (download.busy && row.module?.id === download.task?.module.id)
      return true;
    return `${row.translation?.abbreviation || ""} ${row.translation?.name || ""} ${row.module?.id || ""} ${row.module?.name || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  const actions = (row: EditionRow) => {
    const { install, translation, module } = row;
    const task =
      module?.id === download.task?.module.id ? download.task : undefined;
    const update =
      !!install &&
      !!module &&
      newerVersion(module.version, install.report.sourceEdition);
    return (
      <Space wrap>
        {translation && (
          <Button
            size="small"
            type="link"
            disabled={working || install?.removing}
            onClick={() => void onRead(translation.id).catch(setActionError)}
          >
            {install && !install.enabled
              ? t("启用并阅读", "Enable and read")
              : t("阅读", "Read")}
          </Button>
        )}
        {task && task.phase !== "failed" ? (
          <div
            className="edition-download"
            role="status"
            aria-label={t("译本下载进度", "Edition download progress")}
          >
            <span>
              {t(
                task.phase === "committing"
                  ? "正在导入"
                  : task.phase === "inspecting"
                    ? "正在校验"
                    : "正在下载",
                task.phase === "committing"
                  ? "Installing"
                  : task.phase === "inspecting"
                    ? "Inspecting"
                    : "Downloading",
              )}
            </span>
            <Progress
              percent={
                task.job?.totalBytes
                  ? Math.min(
                      100,
                      Math.floor(
                        ((task.job?.downloadedBytes || 0) * 100) /
                          task.job.totalBytes,
                      ),
                    )
                  : 0
              }
              size="small"
              status="active"
              showInfo={task.phase === "downloading" && !!task.job?.totalBytes}
            />
            {task.phase === "downloading" && (
              <small>
                {((task.job?.downloadedBytes || 0) / 1048576).toFixed(2)} MiB
              </small>
            )}
            <Button
              size="small"
              type="link"
              disabled={task.phase === "committing"}
              onClick={() => void download.cancel()}
            >
              {t("取消下载", "Cancel download")}
            </Button>
          </div>
        ) : (
          module &&
          (!install || update || task?.phase === "failed") && (
            <Button
              size="small"
              type="primary"
              disabled={working || !module.supported || install?.removing}
              onClick={() => void download.start(module, install)}
            >
              {task?.phase === "failed"
                ? t("重试", "Retry")
                : install
                  ? t("更新", "Update")
                  : t("下载", "Download")}
            </Button>
          )
        )}
        {task?.phase === "failed" && (
          <span className="edition-download-error" role="alert">
            {errorText(task.error, language)}
          </span>
        )}
        {install && (
          <Button
            size="small"
            type="link"
            danger
            disabled={working}
            onClick={() => onRemove(install)}
          >
            {install.removing
              ? t("重试删除", "Retry removal")
              : t("删除", "Remove")}
          </Button>
        )}
      </Space>
    );
  };
  return (
    <div className="edition-manager">
      <Space wrap>
        <Input.Search
          aria-label={t("搜索译本", "Search editions")}
          placeholder={t(
            "搜索译本名称或简称",
            "Search edition name or abbreviation",
          )}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          style={{ width: 280, maxWidth: "100%" }}
        />
        <Button
          type="primary"
          disabled={working}
          onClick={() => void onImport()}
        >
          {t("导入译本文件", "Import edition file")}
        </Button>
        <Button
          aria-label={t("刷新列表", "Refresh list")}
          disabled={working}
          loading={sourceLoading}
          onClick={() => {
            if (remoteRequested) setRefresh((n) => n + 1);
            void onReload().catch(setActionError);
          }}
        >
          {t("刷新列表", "Refresh list")}
        </Button>
      </Space>
      {remoteRequested && (
        <p className="muted">
          {t(
            "来源：CrossWire 官方圣经模块库。点击下载后自动导入本机，供离线阅读；版权与版次见详情。",
            "Source: CrossWire Bible modules. Downloads install automatically for offline reading; see details for notices and versions.",
          )}
        </p>
      )}
      {prototype && (
        <Alert
          type="info"
          title={t(
            "浏览器模拟：下载使用自编中英文示例，本地文件演示测试XML；真实译本请使用桌面应用。",
            "Browser Mock: downloads use synthetic Chinese/English samples; file import uses test XML. Use the desktop app for actual editions.",
          )}
        />
      )}
      {!!sourceError && (
        <Alert
          type="warning"
          showIcon
          title={errorText(sourceError, language)}
          description={t(
            "已安装的译本仍可管理和阅读。",
            "Installed editions remain available.",
          )}
        />
      )}
      {!!actionError && (
        <Alert
          type="error"
          showIcon
          title={errorText(actionError, language)}
          closable
          onClose={() => setActionError(undefined)}
        />
      )}
      <Table<EditionRow>
        size="small"
        loading={loading}
        rowKey="key"
        onRow={(row) => ({
          className: "edition-row",
          "data-module": row.module?.id,
        })}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: t("没有符合条件的译本", "No matching editions") }}
        expandable={{
          columnWidth: 70,
          expandedRowKeys: expanded,
          onExpandedRowsChange: setExpanded,
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              size="small"
              type="link"
              aria-expanded={expanded}
              onClick={(e) => onExpand(record, e)}
            >
              {expanded ? t("收起", "Collapse") : t("详情", "Details")}
            </Button>
          ),
          expandedRowRender: ({ install, translation, module }) => (
            <div className="edition-manager">
              {module && (
                <>
                  <p>
                    CrossWire · {module.id} · {module.version}
                  </p>
                  <pre className="edition-notice">
                    {module.license}
                    {"\n"}
                    {module.about}
                  </pre>
                </>
              )}
              {install ? (
                <EditionDetails
                  key={`${install.translation.id}/${install.translation.dataVersion}`}
                  item={install}
                  language={language}
                  disabled={working}
                  onRestore={async (id, version) => {
                    if (await onRestore(id, version)) setExpanded([]);
                  }}
                />
              ) : (
                !module && (
                  <pre className="edition-notice">{translation?.license}</pre>
                )
              )}
            </div>
          ),
        }}
        columns={[
          {
            title: t("译本", "Edition"),
            render: (_, { translation, install, module }) => (
              <>
                <strong>
                  {translation
                    ? `${translation.abbreviation} · ${translation.name}`
                    : `${module?.id} · ${module?.name}`}
                </strong>
                <div className="muted">
                  {translation?.language || module?.language} ·{" "}
                  {install
                    ? formatNames[install.report.format]
                    : module
                      ? "CrossWire"
                      : t("内置译本", "Bundled edition")}
                  {install?.report.sourceEdition
                    ? ` · ${install.report.sourceEdition}`
                    : module
                      ? ` · ${module.version}`
                      : ""}
                </div>
                {install && (
                  <Tag color={install.enabled ? "success" : "default"}>
                    {install.enabled
                      ? t("已安装", "Installed")
                      : t("已停用", "Disabled")}
                  </Tag>
                )}
                {install?.removing && (
                  <Tag color="warning">
                    {t("删除待重试", "Removal pending")}
                  </Tag>
                )}
                {module && !module.supported && (
                  <Tag>
                    {t("暂不兼容", "Unsupported")} ·{" "}
                    {errorText({ code: module.reason }, language)}
                  </Tag>
                )}
              </>
            ),
          },
          {
            title: t("启用", "Enabled"),
            width: 105,
            render: (_, { install, translation }) =>
              install ? (
                <Switch
                  size="small"
                  checkedChildren={t("开", "On")}
                  unCheckedChildren={t("关", "Off")}
                  aria-label={t(
                    `启用 ${install.translation.name}`,
                    `Enable ${install.translation.name}`,
                  )}
                  checked={install.enabled}
                  disabled={working || install.removing}
                  onChange={(value) => onToggle(install, value)}
                />
              ) : translation ? (
                t("已启用", "Enabled")
              ) : (
                t("未安装", "Not installed")
              ),
          },
          {
            title: t("操作", "Actions"),
            width: "36%",
            render: (_, row) => actions(row),
          },
        ]}
      />
      {!remoteRequested && (
        <Button
          block
          disabled={working}
          onClick={() => setRemoteRequested(true)}
        >
          {t("更多译本", "More editions")}
        </Button>
      )}
      {!installs.length && (
        <p className="muted">
          {t(
            "尚未导入译本；内置译本仍可使用。",
            "No imported editions. Bundled editions remain available.",
          )}
        </p>
      )}
    </div>
  );
}
