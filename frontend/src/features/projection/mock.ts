import type { Dataset } from "../../shared/types";
import {
  emptyProjection,
  pageCount,
  resolveReference,
  type ProjectionState,
  type ProjectionStyle,
} from "./model";
const key = "bible:mock:projection";
const channel = new BroadcastChannel(key);
const listeners = new Set<(state: ProjectionState) => void>();
let popup: Window | null = null;
function read(): ProjectionState {
  return JSON.parse(localStorage.getItem(key) || "null") || emptyProjection();
}
function publish(state: ProjectionState) {
  state.revision++;
  localStorage.setItem(key, JSON.stringify(state));
  channel.postMessage(state);
  listeners.forEach((fn) => fn(state));
  return state;
}
channel.onmessage = (e) =>
  listeners.forEach((fn) => fn(e.data as ProjectionState));
export const mockProjection = {
  async GetProjection() {
    return read();
  },
  WatchProjection(fn: (state: ProjectionState) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  async set(
    data: Dataset,
    reference: string,
    translation: string,
    style: ProjectionStyle,
  ) {
    const passage = reference
      ? resolveReference(data, reference, translation)
      : null;
    const state = read();
    if (passage)
      Object.assign(state, { passage, reference, pageIndex: 0, blank: false });
    state.style = style;
    state.pageIndex = Math.min(state.pageIndex, pageCount(state) - 1);
    return publish(state);
  },
  async ControlProjection(action: string) {
    const state = read();
    switch (action) {
      case "next":
        state.pageIndex = Math.min(pageCount(state) - 1, state.pageIndex + 1);
        break;
      case "previous":
        state.pageIndex = Math.max(0, state.pageIndex - 1);
        break;
      case "blank":
        state.blank = !state.blank;
        break;
      default:
        throw new Error("无效的投影操作");
    }
    return publish(state);
  },
  async ProjectionWindow(action: string) {
    const audience = new URLSearchParams(location.search).has("projection");
    if (action === "controls") {
      window.opener?.postMessage("bible:projection-controls", location.origin);
      window.opener?.focus();
    } else if (action === "stop") {
      popup?.close();
      popup = null;
    } else if (
      ["fullscreen", "window", "toggle-fullscreen", "escape"].includes(action)
    ) {
      if (!audience) {
        if (!popup || popup.closed) throw new Error("请先投放经文打开投影窗口");
        popup.focus();
        throw new Error("浏览器预览请在投影窗口按 F11 全屏；桌面版支持此按钮");
      }
      if (
        action === "escape" ||
        action === "window" ||
        document.fullscreenElement
      ) {
        if (document.fullscreenElement) await document.exitFullscreen();
      } else await document.documentElement.requestFullscreen();
    } else {
      if (!popup || popup.closed)
        popup = window.open(
          "/?projection=1",
          "bible-projection",
          "popup,width=1280,height=720",
        );
      if (!popup) throw new Error("无法打开投影窗口，请允许弹出窗口后重试");
      window.focus();
    }
    return true;
  },
};
window.addEventListener("beforeunload", () => {
  popup?.close();
});
