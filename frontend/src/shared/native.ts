import * as bridge from "../../bindings/github.com/xibolun/bible/internal/service/service";
import type {
  API,
  Book,
  CardContent,
  Chapter,
  Highlight,
  Preferences,
  Saved,
  Translation,
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
    throw new Error(r.error ? r.error.message : "桌面服务返回了无效结果");
  return r.data as T;
}
export const native: API = {
  ListTranslations: () => invoke<Translation[]>(bridge.ListTranslations()),
  ListBooks: (ids) => invoke<Book[]>(bridge.ListBooks(ids)),
  GetChapter: (ids, book, ch, request) =>
    invoke<Chapter>(bridge.GetChapter(ids, book, ch, request)),
  GetPreferences: () => invoke<Preferences>(bridge.GetPreferences()),
  SavePreferences: (p) => invoke<boolean>(bridge.SavePreferences(p)),
  ListHighlights: (ids, book, ch) =>
    invoke<Highlight[]>(bridge.ListHighlights(ids, book, ch)),
  ApplyHighlight: (request, sel, color) =>
    invoke<Highlight[]>(bridge.ApplyHighlight(request, sel, color)),
  CopySelection: (sel, mode, ids) =>
    invoke<boolean>(bridge.CopySelection(sel, mode, ids)),
  GetCard: (sel, ids, full) =>
    invoke<CardContent>(bridge.GetCard(sel, ids, full)),
  SaveCard: (png, w, h, name, sel) =>
    invoke<Saved>(bridge.SaveCard(png, w, h, name, sel)),
};
export const reportSmoke = (passed: boolean) =>
  invoke<boolean>(bridge.ReportSmoke(passed));
