export type ReadingTheme = "light" | "paper" | "sage" | "night";

export const readingThemes: { value: ReadingTheme; zh: string; en: string }[] =
  [
    { value: "light", zh: "清爽浅色", en: "Light" },
    { value: "paper", zh: "暖纸色", en: "Warm paper" },
    { value: "sage", zh: "柔绿色", en: "Soft sage" },
    { value: "night", zh: "静谧夜读", en: "Quiet night" },
  ];

export const palettes = {
  light: {
    page: "#ffffff",
    surface: "#f5f8fa",
    raised: "#ffffff",
    text: "#273945",
    secondary: "#5a7080",
    border: "#e1e7eb",
    primary: "#315f78",
    selected: "#e0ebf1",
    hover: "#eaf0f4",
    selection: "#92b9d980",
  },
  paper: {
    page: "#f6f1e6",
    surface: "#eee7d9",
    raised: "#fbf7ee",
    text: "#494238",
    secondary: "#6d6352",
    border: "#d9d0bf",
    primary: "#776044",
    selected: "#e5d9c4",
    hover: "#ede3d1",
    selection: "#c4a67366",
  },
  sage: {
    page: "#edf2eb",
    surface: "#e3eae0",
    raised: "#f4f7f1",
    text: "#36483c",
    secondary: "#536855",
    border: "#cad6c6",
    primary: "#4e715c",
    selected: "#d4e2cf",
    hover: "#dfebda",
    selection: "#96b58b66",
  },
  night: {
    page: "#242c2b",
    surface: "#1e2625",
    raised: "#2c3633",
    text: "#d0d9d1",
    secondary: "#a0b2a5",
    border: "#43534b",
    primary: "#a4c3b1",
    selected: "#3a4c42",
    hover: "#303e37",
    selection: "#759e8580",
  },
} satisfies Record<ReadingTheme, Record<string, string>>;
