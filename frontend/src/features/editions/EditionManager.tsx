import { useCallback, useEffect, useRef, useState, type Key } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Segmented,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from "antd";
import type { API, Preferences, Translation } from "../../shared/types";
import { prototype } from "../../shared/types";
import { errorText, translator } from "../../shared/locale";
import type { EditionCommit, EditionInstall, EditionJob } from "./types";
import { DownloadCatalogue } from "./DownloadCatalogue";
import { EditionDetails, formatNames } from "./EditionDetails";
export function EditionManager({
  api,
  preferences,
  translations,
  onCatalogue,
  onRead,
}: {
  api: API;
  preferences: Preferences;
  translations: Translation[];
  onCatalogue: () => Promise<void>;
  onRead: (id: string) => Promise<void>;
}) {
  const t = translator(preferences.uiLanguage),
    { modal, message } = App.useApp();
  const [installs, setInstalls] = useState<EditionInstall[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [job, setJob] = useState<EditionJob>();
  const [expanded, setExpanded] = useState<readonly Key[]>([]);
  const [form] = Form.useForm<EditionCommit>();
  const [view, setView] = useState<"installed" | "download">("installed");
  const [downloadVisited, setDownloadVisited] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [queries, setQueries] = useState({ installed: "", download: "" });
  const [filters, setFilters] = useState({ installed: "", download: "zh" });
  const currentJob = useRef<string | undefined>(undefined);
  const initialized = useRef("");
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setInstalls(await api.ListEditionInstalls());
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void reload().catch((e) => setError(errorText(e, preferences.uiLanguage)));
    return () => {
      mounted.current = false;
      if (currentJob.current)
        void api.CancelEditionImport(currentJob.current).catch(() => {});
    };
  }, [api, reload, preferences.uiLanguage]);
  const accept = useCallback(
    (value: EditionJob) => {
      if (!mounted.current) return;
      setJob(value);
      currentJob.current = value.id;
      if (
        value.status === "ready" &&
        value.report &&
        initialized.current !== value.id
      ) {
        initialized.current = value.id;
        form.setFieldsValue({
          name: value.report.name,
          abbreviation: value.report.abbreviation,
          language: value.report.language,
        });
      }
    },
    [form],
  );
  useEffect(() => {
    if (
      !job ||
      !["queued", "downloading", "inspecting", "committing"].includes(
        job.status,
      )
    )
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api.GetEditionImportJob(job.id);
        if (!active) return;
        accept(value);
        if (
          ["queued", "downloading", "inspecting", "committing"].includes(
            value.status,
          )
        )
          timer = setTimeout(() => void poll(), 250);
      } catch (e) {
        if (active) setError(errorText(e, preferences.uiLanguage));
      }
    };
    timer = setTimeout(() => void poll(), 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, job?.id, job?.status, accept, preferences.uiLanguage]);
  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await reload();
      await onCatalogue();
      return true;
    } catch (e) {
      setError(errorText(e, preferences.uiLanguage));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const choose = async (replaceId = "") => {
    setBusy(true);
    setError("");
    try {
      const selected = await api.ChooseEditionImport();
      if (selected.cancelled) return;
      initialized.current = "";
      form.resetFields();
      form.setFieldsValue({ replaceId });
      accept(await api.InspectEditionImport(selected.token));
    } catch (e) {
      setError(errorText(e, preferences.uiLanguage));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!job) return;
    try {
      const result = await api.CancelEditionImport(job.id);
      if (result.status !== "committing") {
        setJob(undefined);
        currentJob.current = undefined;
      }
    } catch (e) {
      setError(errorText(e, preferences.uiLanguage));
    }
  };
  const commit = async () => {
    const values = await form.validateFields();
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.CommitEditionImport(job.id, {
        ...values,
        replaceId: values.replaceId || "",
      });
      accept(result);
      await reload();
      await onCatalogue();
      void message.success(
        result.installed?.duplicate
          ? t(
              "此正文已安装，可在版本记录中查看",
              "This text is already installed; check its version history",
            )
          : t("译本已保存在本机", "Edition installed locally"),
      );
    } catch (e) {
      setError(errorText(e, preferences.uiLanguage));
    } finally {
      setBusy(false);
    }
  };
  const impact = t(
    "停用或删除后，相关阅读选择和搜索历史将使用可用译本；当前投影画面保持不变。",
    "Reading and search history will fall back to available editions. The current projection remains unchanged.",
  );
  const remove = (item: EditionInstall) => {
    let purge = false;
    modal.confirm({
      title: t(
        `删除 ${item.translation.name}？`,
        `Remove ${item.translation.name}?`,
      ),
      content: (
        <Space orientation="vertical">
          <p>{impact}</p>
          <p>
            {t(
              "默认保留高亮；重新导入同一正文可恢复。",
              "Highlights are retained by default and recoverable by importing the same text.",
            )}
          </p>
          <Checkbox
            onChange={(e) => {
              purge = e.target.checked;
            }}
          >
            {t(
              "同时删除此译本的所有高亮",
              "Also delete all highlights for this edition",
            )}
          </Checkbox>
        </Space>
      ),
      okText: t("删除", "Remove"),
      okButtonProps: { danger: true },
      cancelText: t("取消", "Cancel"),
      onOk: async () => {
        if (
          !(await perform(() => api.RemoveEdition(item.translation.id, purge)))
        )
          throw new Error("Removal failed");
      },
    });
  };
  const toggle = (item: EditionInstall, enabled: boolean) => {
    if (enabled) {
      void perform(() => api.SetEditionEnabled(item.translation.id, true));
      return;
    }
    modal.confirm({
      title: t(
        `停用 ${item.translation.name}？`,
        `Disable ${item.translation.name}?`,
      ),
      content: impact,
      okText: t("停用", "Disable"),
      cancelText: t("取消", "Cancel"),
      onOk: async () => {
        if (
          !(await perform(() =>
            api.SetEditionEnabled(item.translation.id, false),
          ))
        )
          throw new Error("Disable failed");
      },
    });
  };
  const readEdition = async (id: string) => {
    if (installs.some((item) => item.translation.id === id && !item.enabled)) {
      if (!(await perform(() => api.SetEditionEnabled(id, true)))) return;
    }
    await onRead(id);
  };
  const working =
    busy ||
    job?.status === "queued" ||
    job?.status === "downloading" ||
    job?.status === "inspecting" ||
    job?.status === "committing";
  const actions = (item: EditionInstall) => (
    <Space wrap size="small">
      <Switch
        size="small"
        aria-label={t(
          `启用 ${item.translation.name}`,
          `Enable ${item.translation.name}`,
        )}
        checked={item.enabled}
        disabled={working || item.removing}
        onChange={(v) => toggle(item, v)}
      />
      <Button
        size="small"
        type="link"
        disabled={working || item.removing}
        onClick={() =>
          void readEdition(item.translation.id).catch((e) =>
            setError(errorText(e, preferences.uiLanguage)),
          )
        }
      >
        {item.enabled ? t("阅读", "Read") : t("启用并阅读", "Enable and read")}
      </Button>
      <Button
        size="small"
        type="link"
        disabled={working || item.removing}
        onClick={() => void choose(item.translation.id)}
      >
        {t("替换", "Replace")}
      </Button>
      <Button
        size="small"
        type="link"
        danger
        disabled={working}
        onClick={() => remove(item)}
      >
        {t(
          item.removing ? "重试删除" : "删除",
          item.removing ? "Retry removal" : "Remove",
        )}
      </Button>
    </Space>
  );
  const renderDetails = (item: EditionInstall) => (
    <EditionDetails
      key={`${item.translation.id}/${item.translation.dataVersion}`}
      item={item}
      language={preferences.uiLanguage}
      disabled={working}
      onRestore={async (id, version) => {
        if (await perform(() => api.RestoreEditionVersion(id, version)))
          setExpanded([]);
      }}
    />
  );
  const matches = (translation: Translation) =>
    (!filters[view] ||
      (filters[view] === "en"
        ? translation.language === "en"
        : /^zh\b/i.test(translation.language))) &&
    `${translation.id} ${translation.name} ${translation.abbreviation}`
      .toLowerCase()
      .includes(queries[view].trim().toLowerCase());
  const rows: (EditionInstall | Translation)[] = [
    ...translations.filter((v) => v.origin !== "user" && matches(v)),
    ...installs.filter((v) => matches(v.translation)),
  ];
  return (
    <section
      aria-label={t("译本管理", "Edition manager")}
      className="edition-manager"
    >
      <Space wrap>
        <Segmented
          aria-label={t("译本列表", "Edition list")}
          value={view}
          options={[
            { value: "installed", label: t("已安装", "Installed") },
            { value: "download", label: t("下载译本", "Download editions") },
          ]}
          onChange={(value) => {
            setView(value as "installed" | "download");
            if (value === "download") setDownloadVisited(true);
          }}
        />
        <Button
          type="primary"
          aria-label={t("导入译本文件", "Import edition file")}
          loading={busy}
          disabled={working}
          onClick={() => void choose()}
        >
          {t("导入译本文件", "Import edition file")}
        </Button>
        <Button
          disabled={working}
          onClick={() =>
            view === "download"
              ? setRefresh((n) => n + 1)
              : void reload().catch((e) =>
                  setError(errorText(e, preferences.uiLanguage)),
                )
          }
        >
          {t("刷新列表", "Refresh list")}
        </Button>
      </Space>
      <Space wrap>
        <Input.Search
          aria-label={t("搜索译本", "Search editions")}
          placeholder={t(
            "搜索译本名称或简称",
            "Search edition name or abbreviation",
          )}
          value={queries[view]}
          onChange={(e) => setQueries({ ...queries, [view]: e.target.value })}
          allowClear
          style={{ width: 280, maxWidth: "100%" }}
        />
        <Select
          aria-label={t("译本语言", "Edition language")}
          value={filters[view]}
          onChange={(value) => setFilters({ ...filters, [view]: value })}
          options={[
            { value: "", label: t("全部语言", "All languages") },
            { value: "zh", label: t("中文", "Chinese") },
            { value: "en", label: t("英文", "English") },
          ]}
          style={{ width: 150 }}
        />
      </Space>
      {error && (
        <Alert
          title={error}
          type="error"
          showIcon
          closable
          onClose={() => setError("")}
        />
      )}
      {downloadVisited && (
        <div hidden={view !== "download"}>
          <DownloadCatalogue
            api={api}
            language={preferences.uiLanguage}
            query={queries.download}
            filter={filters.download}
            refresh={refresh}
            disabled={working}
            installs={installs}
            renderActions={actions}
            renderDetails={renderDetails}
            onDownload={async (id) => {
              setBusy(true);
              setError("");
              try {
                initialized.current = "";
                form.resetFields();
                form.setFieldsValue({ replaceId: "" });
                accept(await api.DownloadCrossWireEdition(id));
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
      <div hidden={view !== "installed"} className="edition-manager">
        <p className="muted">
          {t(
            "MyBible / MySword / theWord / OSIS / Zefania XML / SWORD ZIP；本地导入，保留原版权说明。",
            "MyBible / MySword / theWord / OSIS / Zefania XML / SWORD ZIP. Local import; original copyright notices are retained.",
          )}
        </p>
        {prototype && (
          <Alert
            title={t(
              "浏览器模拟：文件流程仅演示测试XML；完整格式解析及持久化以桌面应用为准。",
              "Browser Mock: file flow demonstrates test XML only. Use the desktop app for complete parsing and persistence.",
            )}
            type="info"
          />
        )}
        <Table<EditionInstall | Translation>
          size="small"
          loading={loading}
          rowKey={(item) =>
            "translation" in item ? item.translation.id : item.id
          }
          dataSource={rows}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          locale={{
            emptyText: t("没有符合条件的译本", "No matching editions"),
          }}
          expandable={{
            columnWidth: 70,
            expandedRowKeys: expanded,
            onExpandedRowsChange: setExpanded,
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
            expandedRowRender: (item) =>
              "translation" in item ? (
                renderDetails(item)
              ) : (
                <pre className="edition-notice">{item.license}</pre>
              ),
          }}
          columns={[
            {
              title: t("译本", "Edition"),
              render: (_, row) => {
                const item = "translation" in row ? row : undefined;
                const translation = item
                  ? item.translation
                  : (row as Translation);
                return (
                  <div>
                    <strong>
                      {translation.abbreviation} · {translation.name}
                    </strong>
                    <div className="muted">
                      {item
                        ? formatNames[translation.sourceFormat || ""] ||
                          translation.sourceFormat
                        : t("内置译本", "Bundled edition")}{" "}
                      · {translation.language}
                    </div>
                    {item?.removing && (
                      <Tag color="warning">
                        {t("删除待重试", "Removal pending")}
                      </Tag>
                    )}
                  </div>
                );
              },
            },
            {
              title: t("操作", "Actions"),
              width: "36%",
              render: (_, item) =>
                "translation" in item ? (
                  actions(item)
                ) : (
                  <Button
                    size="small"
                    type="link"
                    disabled={working}
                    onClick={() =>
                      void onRead(item.id).catch((e) =>
                        setError(errorText(e, preferences.uiLanguage)),
                      )
                    }
                  >
                    {t("阅读", "Read")}
                  </Button>
                ),
            },
          ]}
        />
        {!installs.length && (
          <p className="muted">
            {t(
              "尚未导入译本；内置译本仍可使用。",
              "No imported editions. Bundled editions remain available.",
            )}
          </p>
        )}
      </div>
      <Modal
        open={!!job}
        title={t("本地译本导入", "Local edition import")}
        width={760}
        style={{ maxWidth: "calc(100vw - 32px)", top: 24 }}
        styles={{
          body: { maxHeight: "calc(100dvh - 190px)", overflowY: "auto" },
        }}
        maskClosable={false}
        closable={!working}
        onCancel={() => void cancel()}
        footer={
          job?.status === "ready" ? (
            <Space>
              <Button disabled={busy} onClick={() => void cancel()}>
                {t("取消", "Cancel")}
              </Button>
              <Button
                type="primary"
                loading={busy}
                onClick={() => void commit().catch(() => {})}
              >
                {t("确认导入", "Confirm import")}
              </Button>
            </Space>
          ) : (
            <Button
              disabled={job?.status === "committing"}
              onClick={() => void cancel()}
            >
              {t(
                job?.status === "downloading"
                  ? "取消下载"
                  : job?.status === "inspecting"
                    ? "取消检查"
                    : "关闭",
                job?.status === "downloading"
                  ? "Cancel download"
                  : job?.status === "inspecting"
                    ? "Cancel inspection"
                    : "Close",
              )}
            </Button>
          )
        }
      >
        {error && <Alert title={error} type="error" showIcon />}
        {(job?.status === "queued" ||
          job?.status === "downloading" ||
          job?.status === "inspecting" ||
          job?.status === "committing") && (
          <Spin
            description={t(
              job.status === "downloading"
                ? "正在下载译本…"
                : job.status === "committing"
                  ? "正在本地安装…"
                  : "正在检查文件…",
              job.status === "downloading"
                ? "Downloading edition…"
                : job.status === "committing"
                  ? "Installing locally…"
                  : "Inspecting file…",
            )}
          />
        )}
        {job?.status === "downloading" && (
          <div>
            <p>
              {((job.downloadedBytes || 0) / 1048576).toFixed(2)} MiB
              {job.totalBytes
                ? ` / ${(job.totalBytes / 1048576).toFixed(2)} MiB`
                : ""}
            </p>
            {!!job.totalBytes && (
              <Progress
                percent={Math.min(
                  100,
                  Math.floor(
                    ((job.downloadedBytes || 0) * 100) / job.totalBytes,
                  ),
                )}
              />
            )}
          </div>
        )}
        {job?.problem && (
          <Alert
            type="error"
            showIcon
            title={errorText(
              { code: job.problem.code, message: job.problem.code },
              preferences.uiLanguage,
            )}
            description={job.problem.position}
          />
        )}
        {job?.status === "done" && (
          <Space orientation="vertical">
            <Alert
              type="success"
              title={t(
                job.installed?.duplicate ? "此正文已存在" : "译本已安装",
                job.installed?.duplicate
                  ? "Text already installed"
                  : "Edition installed",
              )}
            />
            <Button
              type="primary"
              onClick={() => {
                if (job.installed)
                  void readEdition(job.installed.id).catch((e) =>
                    setError(errorText(e, preferences.uiLanguage)),
                  );
              }}
            >
              {job.installed &&
              installs.some(
                (v) => v.translation.id === job.installed!.id && !v.enabled,
              )
                ? t("启用并阅读", "Enable and read")
                : t("开始阅读", "Start reading")}
            </Button>
          </Space>
        )}
        {job?.status === "ready" && job.report && (
          <>
            <p>
              {formatNames[job.report.format]} · {job.report.books}{" "}
              {t("卷", "books")} / {job.report.chapters} {t("章", "chapters")} /{" "}
              {job.report.verses} {t("条经文记录", "verse records")}
            </p>
            <h4>{t("实际经文预览", "Actual scripture preview")}</h4>
            <div className="edition-samples">
              {job.samples.map((v) => (
                <p key={`${v.book}/${v.chapter}/${v.label}`}>
                  <strong>
                    {v.book} {v.chapter}:{v.label}
                  </strong>
                  {"\n"}
                  {v.text}
                </p>
              ))}
            </div>
            <Form form={form} layout="vertical">
              <Form.Item
                name="name"
                label={t("译本名称", "Edition name")}
                rules={[{ required: true, whitespace: true, max: 100 }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Space align="start" wrap>
                <Form.Item
                  name="abbreviation"
                  label={t("简称", "Abbreviation")}
                  rules={[{ required: true, whitespace: true, max: 32 }]}
                >
                  <Input maxLength={32} />
                </Form.Item>
                <Form.Item
                  name="language"
                  label={t("语言代码", "Language code")}
                  rules={[{ required: true, whitespace: true, max: 35 }]}
                >
                  <Input maxLength={35} />
                </Form.Item>
              </Space>
              <Form.Item name="replaceId" label={t("安装方式", "Install as")}>
                <Select
                  options={[
                    {
                      value: "",
                      label: t("另存为用户译本", "Add as a user edition"),
                    },
                    ...installs
                      .filter((v) => !v.removing)
                      .map((v) => ({
                        value: v.translation.id,
                        label: t(
                          `替换 ${v.translation.name}（保留旧版）`,
                          `Replace ${v.translation.name} (retain previous version)`,
                        ),
                      })),
                  ]}
                />
              </Form.Item>
            </Form>
            <Alert
              title={t("检查结果", "Inspection report")}
              description={
                <ul>
                  {job.report.diagnostics.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              }
              type="info"
            />
            <h4>{t("来源与版权说明", "Source and copyright notice")}</h4>
            <p>{job.report.sourceEdition}</p>
            <pre className="edition-notice">{job.report.license}</pre>
          </>
        )}
      </Modal>
    </section>
  );
}
