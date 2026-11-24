import { editionRows, newerVersion } from "./catalogue";
import type { Translation } from "../../shared/types";
import type { DownloadEdition, EditionInstall } from "./types";

it("offers numeric upgrades without downgrade, equal-version or unknown ordering prompts", () => {
  expect(newerVersion("1.10", "1.9")).toBe(true);
  expect(newerVersion("3.1.1", "3.1")).toBe(true);
  expect(newerVersion("v2.0", "1.99")).toBe(true);
  for (const [remote, local] of [
    ["1.2", "1.2.0"],
    ["2", "2.0"],
    ["1.9", "1.10"],
    ["latest", "1"],
    ["2", ""],
    ["2-beta", "1"],
  ]) {
    expect(newerVersion(remote, local)).toBe(false);
  }
});

it("flattens both languages and links renamed installed editions only through retained provenance", () => {
  const modules = [
    { id: "EN", language: "en" },
    { id: "ZH", language: "zh-Hans" },
  ] as DownloadEdition[];
  const installs = [
    {
      translation: { id: "user:one", name: "My renamed edition" },
      report: {
        format: "sword",
        metadata: {
          DownloadURL:
            "https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/EN.zip",
        },
      },
    },
    {
      translation: { id: "user:two", name: "ZH" },
      report: { format: "zefania", metadata: {} },
    },
  ] as EditionInstall[];
  const rows = editionRows([{ id: "cuv" }] as Translation[], installs, modules);
  expect(rows).toHaveLength(4);
  expect(rows.find((r) => r.key === "user:one")?.module?.id).toBe("EN");
  expect(rows.find((r) => r.key === "user:two")?.module).toBeUndefined();
  expect(rows.find((r) => r.module?.id === "ZH")?.install).toBeUndefined();
  expect(
    editionRows([{ id: "cuv" }] as Translation[], installs, []),
  ).toHaveLength(3);
});
