import type { Translation } from "../../shared/types";
import type { DownloadEdition, EditionInstall } from "./types";

export interface EditionRow {
  key: string;
  translation?: Translation;
  install?: EditionInstall;
  module?: DownloadEdition;
}

export function editionRows(
  translations: Translation[],
  installs: EditionInstall[],
  modules: DownloadEdition[],
): EditionRow[] {
  const source = new Map(
    modules.map((m) => [
      `https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/${m.id}.zip`,
      m,
    ]),
  );
  const linked = new Set<string>();
  return [
    ...translations
      .filter((v) => v.origin !== "user")
      .map((translation) => ({ key: translation.id, translation })),
    ...installs.map((install) => {
      const module =
        install.report.format === "sword"
          ? source.get(install.report.metadata.DownloadURL)
          : undefined;
      if (module) linked.add(module.id);
      return {
        key: install.translation.id,
        translation: install.translation,
        install,
        module,
      };
    }),
    ...modules
      .filter((m) => !linked.has(m.id))
      .map((module) => ({ key: `source:${module.id}`, module })),
  ];
}

// CrossWire releases use dotted numeric versions. Do not offer downgrades or
// guess the ordering of unfamiliar version schemes.
export function newerVersion(remote: string, local: string): boolean {
  const version = /^v?\d+(?:\.\d+)*$/i;
  if (!version.test(remote) || !version.test(local)) return false;
  const a = remote.replace(/^v/i, "").split(".").map(BigInt);
  const b = local.replace(/^v/i, "").split(".").map(BigInt);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0n) !== (b[i] ?? 0n)) return (a[i] ?? 0n) > (b[i] ?? 0n);
  }
  return false;
}
