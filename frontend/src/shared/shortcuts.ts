import type { API, Preferences } from "./types";

export function commandShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "shiftKey"
    | "repeat"
    | "isComposing"
  >,
) {
  if (
    (!event.ctrlKey && !event.metaKey) ||
    (event.ctrlKey && event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    event.isComposing
  )
    return;
  switch (event.key.toLowerCase()) {
    case "f":
      return "search";
    case "c":
      return "copy";
    case "q":
      return "quit";
  }
}

export async function saveAndQuit(
  api: Pick<API, "SavePreferences" | "Quit">,
  preferences: Preferences,
) {
  if (!(await api.SavePreferences(preferences)))
    throw new Error("STORAGE_ERROR");
  return api.Quit();
}
