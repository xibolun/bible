import { useState } from "react";
import { Button, Descriptions, Select, Space } from "antd";
import { translator } from "../../shared/locale";
import type { EditionInstall } from "./types";

export const formatNames: Record<string, string> = {
  mybible: "MyBible",
  mysword: "MySword",
  theword: "theWord",
  osis: "OSIS",
  zefania: "Zefania XML",
  sword: "SWORD",
};

export function EditionDetails({
  item,
  language,
  disabled,
  onRestore,
}: {
  item: EditionInstall;
  language: "zh-CN" | "en";
  disabled: boolean;
  onRestore: (id: string, version: string) => Promise<void>;
}) {
  const t = translator(language);
  const [restore, setRestore] = useState(item.translation.dataVersion);
  return (
    <section
      aria-label={t("译本详情", "Edition details")}
      className="edition-manager"
    >
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: "format",
            label: t("来源格式", "Source format"),
            children: formatNames[item.report.format],
          },
          {
            key: "coverage",
            label: t("内容范围", "Coverage"),
            children: `${item.report.books} / ${item.report.chapters} / ${item.report.verses} ${t("卷 / 章 / 记录", "books / chapters / records")}`,
          },
          {
            key: "size",
            label: t("正文占用", "Scripture size"),
            children: `${(item.bytes / 1048576).toFixed(2)} MiB`,
          },
          {
            key: "source",
            label: t("来源", "Source"),
            children: (
              <span className="edition-source">
                {item.report.sourceUrl || t("未提供", "Not supplied")}
              </span>
            ),
          },
        ]}
      />
      <h4>{t("版权说明", "Copyright notice")}</h4>
      <pre className="edition-notice">{item.report.license}</pre>
      <h4>{t("检查报告", "Inspection report")}</h4>
      <ul>
        {item.report.diagnostics.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
      <h4>{t("保留的版次", "Retained versions")}</h4>
      <Space wrap>
        <Select
          aria-label={t("恢复译本版次", "Restore edition version")}
          style={{ width: 280, maxWidth: "100%" }}
          value={restore}
          onChange={setRestore}
          options={item.versions.map((v) => ({
            value: v.fingerprint,
            label: `${v.sourceEdition || ""} ${new Date(v.created).toLocaleString()}`,
          }))}
        />
        <Button
          disabled={
            disabled ||
            item.removing ||
            restore === item.translation.dataVersion
          }
          onClick={() => void onRestore(item.translation.id, restore)}
        >
          {t("恢复此版", "Restore version")}
        </Button>
      </Space>
    </section>
  );
}
