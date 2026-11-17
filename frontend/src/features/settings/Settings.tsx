import { Button, Drawer, InputNumber, Segmented, Select, Tabs } from "antd";
import type { Preferences, Translation } from "../../shared/types";
import { translator } from "../../shared/locale";
import packageInfo from "../../../package.json";

export function Settings({
  preferences,
  translations,
  onChange,
  onClose,
}: {
  preferences: Preferences;
  translations: Translation[];
  onChange: (value: Partial<Preferences>) => void;
  onClose: () => void;
}) {
  const t = translator(preferences.uiLanguage);
  return (
    <Drawer
      open
      title={t("设置", "Settings")}
      width={460}
      onClose={onClose}
      extra={<Button onClick={onClose}>{t("完成", "Done")}</Button>}
    >
      <Tabs
        items={[
          {
            key: "reading",
            label: t("阅读与复制", "Reading & copying"),
            children: (
              <div className="settings-fields">
                <label>
                  {t("复制时引用位置", "Reference position when copying")}
                  <Segmented
                    block
                    aria-label={t("复制时引用位置", "Copy reference position")}
                    value={preferences.referencePosition}
                    options={[
                      { value: "before", label: t("经文之前", "Before text") },
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
                <p className="muted">
                  {t(
                    "复制始终包含书卷、章、节范围与译本；快捷键复制同样生效。",
                    "Every copy includes the book, chapter, verse range and edition, including keyboard copy.",
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
              </div>
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
                  {t("应用版本", "Application version")} {packageInfo.version}
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
                    "译文、字体与依赖来源见发行包 THIRD_PARTY_NOTICES。",
                    "Scripture, font and dependency notices are included in THIRD_PARTY_NOTICES in the distribution.",
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
