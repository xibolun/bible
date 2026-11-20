import * as bridge from "../../bindings/github.com/xibolun/bible/internal/service/service";
import { Browser, Events } from "@wailsio/runtime";
import type { ProjectionState } from "../features/projection/model";
import { sourceRepository } from "./build";
import type {
  API,
  Book,
  CardContent,
  Chapter,
  Highlight,
  Preferences,
  Saved,
  Translation,
  DictionaryEntry,
  VerseStudy,
  SearchPage,
} from "./types";
interface Result {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; operationId: string } | null;
}
async function invoke<T>(request: PromiseLike<Result>): Promise<T> {
  let r: Result;
  try {
    r = await request;
  } catch {
    throw new Error("桌面服务未连接，请重启应用。");
  }
  if (!r.ok || r.data === undefined || r.data === null)
    throw Object.assign(
      new Error(r.error ? r.error.message : "桌面服务返回了无效结果"),
      { code: r.error?.code },
    );
  return r.data as T;
}
export const native: API = {
  GetProjection: () => invoke<ProjectionState>(bridge.GetProjection()),
  SetProjection: (reference, translation, style) =>
    invoke<ProjectionState>(
      bridge.SetProjection(reference, translation, {
        ...style,
        themeId: style.themeId || "",
        chapterNumerals: style.chapterNumerals || "arabic",
        referenceBrackets: style.referenceBrackets || "none",
      }),
    ),
  ControlProjection: (action) =>
    invoke<ProjectionState>(bridge.ControlProjection(action)),
  ProjectionWindow: (action) =>
    invoke<boolean>(bridge.ProjectionWindow(action)),
  WatchProjection: (fn) =>
    Events.On("bible:projection", (event) => fn(event.data as ProjectionState)),
  Quit: () => invoke<boolean>(bridge.Quit()),
  SearchScripture: (translation, pattern, offset, limit) =>
    invoke<SearchPage>(
      bridge.SearchScripture(translation, pattern, offset, limit),
    ),
  LookupWord: (code) => invoke<DictionaryEntry>(bridge.LookupWord(code)),
  GetVerseWords: (book, chapter, verse) =>
    invoke<VerseStudy>(bridge.GetVerseWords(book, chapter, verse)),
  ListTranslations: () => invoke<Translation[]>(bridge.ListTranslations()),
  ListBooks: (ids) => invoke<Book[]>(bridge.ListBooks(ids)),
  GetChapter: (ids, book, ch, request) =>
    invoke<Chapter>(bridge.GetChapter(ids, book, ch, request)),
  GetPreferences: () => invoke<Preferences>(bridge.GetPreferences()),
  SavePreferences: (p) =>
    invoke<boolean>(
      bridge.SavePreferences({
        ...p,
        projectionStyle: {
          ...p.projectionStyle,
          themeId: p.projectionStyle.themeId || "",
        },
      }),
    ),
  ListHighlights: (ids, book, ch) =>
    invoke<Highlight[]>(bridge.ListHighlights(ids, book, ch)),
  ApplyHighlight: (request, sel, color) =>
    invoke<Highlight[]>(bridge.ApplyHighlight(request, sel, color)),
  CopySelection: (sel, mode, ids, options) =>
    invoke<boolean>(
      bridge.CopySelection(sel, mode, ids, {
        ...options,
        chapterNumerals: options.chapterNumerals || "arabic",
        referenceBrackets: options.referenceBrackets || "none",
      }),
    ),
  GetCard: (sel, ids, full, options) =>
    invoke<CardContent>(
      bridge.GetCard(sel, ids, full, {
        ...options,
        chapterNumerals: options.chapterNumerals || "arabic",
        referenceBrackets: options.referenceBrackets || "none",
      }),
    ),
  OpenSource: async () => {
    await Browser.OpenURL(sourceRepository);
    return true;
  },
  SaveCard: (png, w, h, name, sel) =>
    invoke<Saved>(bridge.SaveCard(png, w, h, name, sel)),
};
export const reportSmoke = (passed: boolean, version: string) =>
  invoke<boolean>(bridge.ReportSmoke(passed, version));
