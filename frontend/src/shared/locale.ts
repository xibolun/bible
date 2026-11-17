import type { Preferences } from "./types";

export type Language = Preferences["uiLanguage"];
export const translator = (language: Language) => (zh: string, en: string) =>
  language === "en" ? en : zh;

const errors: Record<string, string> = {
  INVALID_SEARCH:
    "Enter a 1–128 character search pattern and check escapes and pagination.",
  INVALID_WORD: "Enter a Strong’s number such as H430 or G3056.",
  WORD_NOT_FOUND: "This Strong’s entry is not in the bundled dictionary.",
  INVALID_REFERENCE: "This book or chapter is unavailable.",
  INVALID_TRANSLATION: "Choose distinct installed translations.",
  DATA_UNAVAILABLE:
    "Bundled scripture is unavailable. Reinstall the complete application.",
  INVALID_SELECTION:
    "Select consecutive scripture in one chapter and translation.",
  MIXED_TRANSLATION:
    "Select text from one translation at a time. Use Shift-click to select consecutive verses.",
  STALE_DATA: "The scripture version changed. Select the text again.",
  STORAGE_ERROR:
    "Local data could not be read or saved. Check disk permissions and retry.",
  CLIPBOARD_ERROR: "Copy failed. Keep the selection and retry.",
  INVALID_IMAGE: "The card image or dimensions are invalid.",
  EXPORT_ERROR:
    "Save failed. Check the destination folder and free disk space.",
  INVALID_SETTINGS: "The reading settings are invalid.",
  CARD_LIMIT: "Cards support up to 20 verses and 4,000 characters.",
  BRIDGE_UNAVAILABLE:
    "The desktop service is unavailable. Restart the application.",
};

export function errorText(error: unknown, language: Language) {
  const value = error as { code?: string; message?: string };
  const code = value?.code ?? value?.message ?? "";
  if (language !== "en" && code === "INVALID_SEARCH")
    return "请输入 1–128 个字符的搜索条件，检查转义符和分页范围。";
  if (language !== "en" && code === "INVALID_WORD")
    return "请输入 Strong’s 编号，例如 H430 或 G3056。";
  if (language !== "en" && code === "WORD_NOT_FOUND")
    return "内置词典没有此 Strong’s 词条。";
  if (language !== "en" && code === "DATA_UNAVAILABLE")
    return "内置资料不可用，请重试或重新安装完整应用。";
  if (language !== "en" && code === "INVALID_REFERENCE")
    return "此书卷、章节或经节没有可用资料。";
  if (code === "MIXED_TRANSLATION" && language !== "en")
    return "请选择同一个译本内的经文，不能混合译本选择；连续多节可使用 Shift 点击。";
  if (code === "INVALID_SELECTION" && language !== "en")
    return "请选择当前章节同一译本内的连续经文。";
  return language === "en"
    ? (errors[code] ?? "The operation could not be completed. Please retry.")
    : (value?.message ?? "操作未完成，请重试。");
}
