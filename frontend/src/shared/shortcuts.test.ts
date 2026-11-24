import { commandShortcut, saveAndQuit } from "./shortcuts";
import { defaults } from "./types";

const event = (key: string, values = {}) => ({
  key,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  ...values,
});
it("recognizes Ctrl and Command shortcuts without consuming input paste", () => {
  for (const modifier of [{}, { ctrlKey: false, metaKey: true }]) {
    expect(commandShortcut(event(",", modifier))).toBe("settings");
    expect(commandShortcut(event("f", modifier))).toBe("search");
    expect(commandShortcut(event("C", modifier))).toBe("copy");
    expect(commandShortcut(event("q", modifier))).toBe("quit");
    expect(commandShortcut(event("v", modifier))).toBeUndefined();
  }
  for (const modifier of [
    { ctrlKey: false },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { repeat: true },
    { isComposing: true },
  ]) {
    expect(commandShortcut(event("f", modifier))).toBeUndefined();
    expect(commandShortcut(event(",", modifier))).toBeUndefined();
  }
});
it("saves the latest settings before quitting and preserves the app on save failure", async () => {
  const calls: string[] = [];
  const preferences = { ...defaults, globalFontSize: 20 };
  const api = {
    SavePreferences: vi.fn(async () => {
      calls.push("save");
      return true;
    }),
    Quit: vi.fn(async () => {
      calls.push("quit");
      return true;
    }),
  };
  await expect(saveAndQuit(api, preferences)).resolves.toBe(true);
  expect(api.SavePreferences).toHaveBeenCalledWith(preferences);
  expect(calls).toEqual(["save", "quit"]);
  api.Quit.mockClear();
  api.SavePreferences.mockResolvedValue(false);
  await expect(saveAndQuit(api, preferences)).rejects.toThrow("STORAGE_ERROR");
  expect(api.Quit).not.toHaveBeenCalled();
  api.SavePreferences.mockRejectedValue(new Error("disk error"));
  await expect(saveAndQuit(api, preferences)).rejects.toThrow("disk error");
  expect(api.Quit).not.toHaveBeenCalled();
});
