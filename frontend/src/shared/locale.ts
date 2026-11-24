import type { Preferences } from "./types";

export type Language = Preferences["uiLanguage"];
export const translator = (language: Language) => (zh: string, en: string) =>
  language === "en" ? en : zh;

const errors: Record<string, string> = {
  PROJECTION_LIMIT:
    "Projection supports up to 12 passages and 600 verses. Reduce the list and retry.",
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

const editionErrors: Record<string, [string, string]> = {
  EDITION_DATA_UNAVAILABLE: [
    "用户译本数据不可用，请重试或检查译本文件。",
    "The user edition data is unavailable. Retry or check the edition file.",
  ],
  VERSIFICATION_UNSUPPORTED: [
    "此译本的节编号体系尚未验证，请单独阅读。",
    "This edition's verse numbering is unverified. Read it individually.",
  ],
  EDITION_LIBRARY_UNAVAILABLE: [
    "用户译本库不可用，内置阅读仍可使用；请检查磁盘或应用版本。",
    "The user edition library is unavailable. Bundled reading remains available. Check disk access and the application version.",
  ],
  FORMAT_UNSUPPORTED: [
    "此文件格式或标记尚不支持，请使用已支持的译本文件。",
    "This format or markup is not supported. Choose a supported edition file.",
  ],
  FORMAT_AMBIGUOUS: [
    "压缩包中有多个译本，请解压后选择其中一个。",
    "The archive contains multiple editions. Extract it and choose one.",
  ],
  ENCRYPTED_MODULE: [
    "不支持此加密资源，请使用获准使用的未加密导出文件。",
    "Protected modules are not supported. Use a permitted, unencrypted export.",
  ],
  ENCODING_UNSUPPORTED: [
    "文件编码无法可靠读取，请使用UTF-8或受支持的XML编码。",
    "The encoding cannot be read reliably. Use UTF-8 or a supported XML encoding.",
  ],
  SCHEMA_UNSUPPORTED: [
    "文件结构不是已支持的译本模块。",
    "The file schema is not a supported Bible module.",
  ],
  REFERENCE_UNSUPPORTED: [
    "书卷或节编号无法可靠解析，文件未安装。",
    "A book or verse identifier cannot be interpreted reliably. The edition was not installed.",
  ],
  INVALID_CONTENT: [
    "文件内容损坏、重复或不完整，文件未安装。",
    "The file is damaged, duplicated or incomplete. The edition was not installed.",
  ],
  IMPORT_LIMIT: [
    "文件大小、记录数量或处理时间超出导入限制。",
    "The import exceeded a file size, record count or processing time limit.",
  ],
  IMPORT_CANCELLED: [
    "已取消导入，未安装任何内容。",
    "Import cancelled. No text was installed.",
  ],
  IMPORT_IO: [
    "无法读取或保存导入数据，请检查磁盘空间和权限后重试。",
    "Import data could not be read or saved. Check disk space and permissions, then retry.",
  ],
  DRAFT_EXPIRED: [
    "预览已失效，请重新选择文件。",
    "The preview expired. Choose the file again.",
  ],
  IMPORT_BUSY: [
    "正在处理另一个导入操作，请稍后重试。",
    "Another import operation is in progress. Please retry when it finishes.",
  ],
};

export function errorText(error: unknown, language: Language) {
  const value = error as { code?: string; message?: string };
  const code = value?.code ?? value?.message ?? "";
  if (editionErrors[code])
    return editionErrors[code][language === "en" ? 1 : 0];
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
