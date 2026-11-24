import {
  App,
  Button,
  Drawer,
  InputNumber,
  Segmented,
  Select,
  Space,
  Tabs,
  Spin,
} from "antd";
import { lazy, Suspense, useState } from "react";
import { GithubOutlined } from "@ant-design/icons";
import type { API, Preferences, Translation } from "../../shared/types";
import { translator, errorText } from "../../shared/locale";
import { appVersion } from "../../shared/build";
import { palettes, readingThemes } from "../../shared/themes";
import { ReferenceOptions } from "../../shared/ReferenceOptions";
const EditionManager = lazy(() =>
  import("../editions/EditionManager").then((m) => ({
    default: m.EditionManager,
  })),
);
import {
  referenceStyles,
  inlineReferences,
  formatPassage,
  passageText,
  type Passage,
} from "../../shared/formatting";

export function Settings({
  preferences,
  api,
  preview,
  translations,
  onChange,
  onClose,
  initialTab = "reading",
  onCatalogue,
  onRead,
}: {
  preferences: Preferences;
  api: API;
  preview?: Passage;
  translations: Translation[];
  onChange: (value: Partial<Preferences>) => void;
  onClose: () => void;
  initialTab?: string;
  onCatalogue: () => Promise<void>;
  onRead: (id: string) => Promise<void>;
}) {
  const t = translator(preferences.uiLanguage);
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState(initialTab);
  return (
    <Drawer
      open
      title={t("设置", "Settings")}
      width={activeTab === "editions" ? 960 : 460}
      onClose={onClose}
      extra={
        <Space>
          <Button
            icon={<GithubOutlined />}
            aria-label={t("访问源码", "View source")}
            onClick={() =>
              void api
                .OpenSource()
                .catch((error) =>
                  message.error(errorText(error, preferences.uiLanguage)),
                )
            }
          >
            {t("源码", "Source")}
          </Button>
          <Button onClick={onClose}>{t("完成", "Done")}</Button>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "reading",
            label: t("阅读与复制", "Reading & copying"),
            children: (
              <div className="settings-fields">
                <fieldset className="theme-picker">
                  <legend>{t("阅读主题", "Reading theme")}</legend>
                  <div role="group" aria-label={t("阅读主题", "Reading theme")}>
                    {readingThemes.map((choice) => (
                      <button
                        key={choice.value}
                        aria-pressed={preferences.readingTheme === choice.value}
                        onClick={() => onChange({ readingTheme: choice.value })}
                      >
                        <span
                          className="theme-swatch"
                          style={{
                            background: palettes[choice.value].page,
                            color: palettes[choice.value].text,
                            borderColor: palettes[choice.value].border,
                          }}
                        >
                          Aa
                        </span>
                        <span>{t(choice.zh, choice.en)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label>
                  {t("复制样式", "Copy style")}
                  <Select
                    aria-label={t("复制样式", "Copy style")}
                    value={preferences.referenceStyle}
                    options={referenceStyles.map((style) => ({
                      value: style.value,
                      label: t(style.zh, style.en),
                    }))}
                    onChange={(referenceStyle) => onChange({ referenceStyle })}
                  />
                </label>
                <ReferenceOptions
                  options={preferences}
                  language={preferences.uiLanguage}
                  onChange={onChange}
                />
                {preview && preview.verses.length > 0 && (
                  <div>
                    <div className="muted">
                      {t("样式预览", "Format preview")}
                    </div>
                    <pre className="format-preview">
                      {passageText(formatPassage(preview, preferences))}
                    </pre>
                  </div>
                )}
                {!inlineReferences(preferences.referenceStyle) && (
                  <label>
                    {t("复制时引用位置", "Reference position when copying")}
                    <Segmented
                      block
                      aria-label={t(
                        "复制时引用位置",
                        "Copy reference position",
                      )}
                      value={preferences.referencePosition}
                      options={[
                        {
                          value: "before",
                          label: t("经文之前", "Before text"),
                        },
                        { value: "after", label: t("经文之后", "After text") },
                      ]}
                      onChange={(value) =>
                        onChange({
                          referencePosition:
                            value as Preferences["referencePosition"],
                        })
                      }
                    />
                  </label>
                )}
                <p className="muted">
                  {t(
                    "复制始终保留引用；译本名称与逐节格式按所选样式显示，快捷键同样生效。",
                    "Copies always retain references. Edition labels and per-verse references follow the selected style, including keyboard copy.",
                  )}
                </p>
                <label>
                  {t("全局字号", "Global font size")}
                  <InputNumber
                    aria-label={t("全局字号", "Global font size")}
                    min={11}
                    max={20}
                    step={1}
                    precision={0}
                    value={preferences.globalFontSize}
                    onChange={(value) => {
                      if (value !== null && value >= 11 && value <= 20)
                        onChange({ globalFontSize: Math.round(value) });
                    }}
                  />
                </label>
                <p className="muted">
                  {t(
                    "同步缩放界面和经文；卡片导出字号单独设置。",
                    "Scales the interface and scripture together. Exported cards retain their own font size.",
                  )}
                </p>
                <label>
                  {t("阅读字号", "Reading font size")}
                  <InputNumber
                    aria-label={t("阅读字号", "Reading font size")}
                    min={14}
                    max={32}
                    step={1}
                    precision={0}
                    value={preferences.fontSize}
                    onChange={(value) => {
                      if (value !== null && value >= 14 && value <= 32)
                        onChange({ fontSize: Math.round(value) });
                    }}
                  />
                </label>
                <label>
                  {t("界面语言", "Interface language")}
                  <Select
                    aria-label={t("界面语言", "Interface language")}
                    value={preferences.uiLanguage}
                    options={[
                      { value: "zh-CN", label: "简体中文" },
                      { value: "en", label: "English" },
                    ]}
                    onChange={(value) => onChange({ uiLanguage: value })}
                  />
                </label>
                <p className="muted">
                  {t(
                    "界面语言不影响所选经文译本。设置自动保存于本机。",
                    "Interface language does not change scripture translations. Settings are saved locally.",
                  )}
                </p>
                <fieldset className="shortcut-settings">
                  <legend>{t("通用快捷键", "Keyboard shortcuts")}</legend>
                  <dl className="shortcut-list">
                    <dt>{t("经文搜索", "Scripture search")}</dt>
                    <dd>Ctrl / ⌘ + F</dd>
                    <dt>{t("复制", "Copy")}</dt>
                    <dd>Ctrl / ⌘ + C</dd>
                    <dt>{t("粘贴", "Paste")}</dt>
                    <dd>Ctrl / ⌘ + V</dd>
                    <dt>{t("退出应用", "Quit application")}</dt>
                    <dd>Ctrl / ⌘ + Q</dd>
                  </dl>
                  <p className="muted">
                    {t(
                      "macOS 使用 ⌘；Windows、Linux 使用 Ctrl。输入框保留标准复制和粘贴。",
                      "Use ⌘ on macOS and Ctrl on Windows/Linux. Inputs retain standard copy and paste.",
                    )}
                  </p>
                </fieldset>
              </div>
            ),
          },
          {
            key: "editions",
            label: t("译本管理", "Editions"),
            children: (
              <Suspense fallback={<Spin />}>
                <EditionManager
                  api={api}
                  preferences={preferences}
                  translations={translations}
                  onCatalogue={onCatalogue}
                  onRead={onRead}
                />
              </Suspense>
            ),
          },
          {
            key: "about",
            label: t("关于", "About"),
            children: (
              <section className="settings-about">
                <img src="/bible.svg" alt="" width={40} />
                <h2>{t("圣经", "Bible")}</h2>
                <p>
                  {t("应用版本", "Application version")} {appVersion}
                </p>
                <p>
                  {t(
                    "离线阅读、多译本对照与经文卡片",
                    "Offline reading, translation comparison and scripture cards",
                  )}
                </p>
                {translations.map((translation) => (
                  <div key={translation.id} className="about-edition">
                    <strong>
                      {translation.abbreviation} · {translation.name}
                    </strong>
                    <p>{translation.license}</p>
                    <small>{translation.dataVersion}</small>
                  </div>
                ))}
                <p className="muted">
                  {t(
                    "内置译文、字体与依赖来源见发行包 THIRD_PARTY_NOTICES；本机导入译本的来源与版权说明见译本管理。",
                    "Bundled scripture, font and dependency notices are in THIRD_PARTY_NOTICES. Imported edition sources and copyright notices are in Editions.",
                  )}
                </p>
              </section>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
