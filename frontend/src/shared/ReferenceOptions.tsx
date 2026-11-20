import { Select } from "antd";
import type { FormatOptions, Preferences } from "./types";
import { chapterNumeralOptions, referenceBracketOptions } from "./formatting";
import { translator, type Language } from "./locale";

export function ReferenceOptions({
  options,
  language,
  onChange,
}: {
  options: FormatOptions;
  language: Language;
  onChange: (value: Partial<FormatOptions>) => void;
}) {
  const t = translator(language);
  return (
    <>
      <label>
        {t("章号数字", "Chapter numerals")}
        <Select<Preferences["chapterNumerals"]>
          aria-label={t("章号数字", "Chapter numerals")}
          value={options.chapterNumerals ?? "arabic"}
          options={chapterNumeralOptions.map((choice) => ({
            value: choice.value,
            label: t(choice.zh, choice.en),
          }))}
          onChange={(chapterNumerals) => onChange({ chapterNumerals })}
        />
      </label>
      <label>
        {t("出处括号", "Reference brackets")}
        <Select<Preferences["referenceBrackets"]>
          aria-label={t("出处括号", "Reference brackets")}
          value={options.referenceBrackets ?? "none"}
          options={referenceBracketOptions.map((choice) => ({
            value: choice.value,
            label: t(choice.zh, choice.en),
          }))}
          onChange={(referenceBrackets) => onChange({ referenceBrackets })}
        />
      </label>
    </>
  );
}
