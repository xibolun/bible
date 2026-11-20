import catalog from "../../../../internal/service/projection-themes.json";
import type { ProjectionStyle } from "./model";

export const projectionThemes = catalog as Array<{
  id: string;
  zh: string;
  en: string;
  backgroundColor: string;
  textColor: string;
  alignment: ProjectionStyle["alignment"];
  font: "sans" | "serif";
  lineHeight: number;
}>;
export function applyProjectionTheme(
  style: ProjectionStyle,
  id: string,
): ProjectionStyle {
  const theme = projectionThemes.find((t) => t.id === id);
  if (!theme) return { ...style, themeId: "custom" };
  return {
    ...style,
    themeId: id,
    backgroundColor: theme.backgroundColor,
    textColor: theme.textColor,
    alignment: theme.alignment,
  };
}
export function normalizeProjectionTheme(
  style: ProjectionStyle,
): ProjectionStyle {
  if (style.themeId === "custom") return style;
  const current = projectionThemes.find((t) => t.id === style.themeId);
  if (style.themeId && !current) return style;
  const matches = (theme: (typeof projectionThemes)[number]) =>
    theme.backgroundColor === style.backgroundColor.toLowerCase() &&
    theme.textColor === style.textColor.toLowerCase() &&
    theme.alignment === style.alignment;
  if (current && matches(current)) return style;
  return { ...style, themeId: projectionThemes.find(matches)?.id || "custom" };
}
