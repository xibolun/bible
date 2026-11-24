// Browser-only fixtures. Native format compatibility is exercised in Go tests.
import type { Dataset } from "../../shared/types";
import type {
  EditionAPI,
  EditionInstall,
  EditionJob,
  EditionRecord,
  EditionReport,
} from "./types";
const key = "bible:mock:user-editions";
interface Stored {
  installs: EditionInstall[];
  records: Record<string, Record<string, EditionRecord[]>>;
  tombstones: Record<string, string>;
}
const saved: Stored = JSON.parse(
  localStorage.getItem(key) || '{"installs":[],"records":{},"tombstones":{}}',
) as Stored;
let job: EditionJob | undefined;
let draft: EditionRecord[] = [];
let source = "";
const persist = () => localStorage.setItem(key, JSON.stringify(saved));
export function restoreMockEditions(data: Dataset) {
  data.translations = data.translations.filter((v) => v.origin !== "user");
  for (const k of Object.keys(data.chapters))
    if (k.startsWith("user:")) delete data.chapters[k];
  for (const item of saved.installs) {
    if (!item.enabled) continue;
    data.translations.push(item.translation);
    for (const v of saved.records[item.translation.id]?.[
      item.translation.dataVersion
    ] || []) {
      const k = `${item.translation.id}/${v.book}/${v.chapter}`;
      (data.chapters[k] ??= []).push({ label: v.label, text: v.text });
    }
  }
  return data;
}
async function fingerprint(text: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function requireJob(id: string) {
  if (!job || job.id !== id) throw new Error("DRAFT_EXPIRED");
  return job;
}
export function mockEditionAPI(
  data: () => Promise<Dataset>,
  purge: (id: string) => void,
): EditionAPI {
  return {
    async ChooseEditionImport() {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xml,.osis";
        const finish = () => input.remove();
        input.addEventListener(
          "cancel",
          () => {
            finish();
            resolve({ token: "", name: "", cancelled: true });
          },
          { once: true },
        );
        input.addEventListener(
          "change",
          () => {
            const file = input.files?.[0];
            finish();
            if (!file) {
              resolve({ token: "", name: "", cancelled: true });
              return;
            }
            if (file.size > 5 << 20) {
              reject(new Error("IMPORT_LIMIT"));
              return;
            }
            void file.text().then((text) => {
              source = text;
              draft = [];
              job = { id: crypto.randomUUID(), status: "queued", samples: [] };
              resolve({ token: job.id, name: file.name, cancelled: false });
            }, reject);
          },
          { once: true },
        );
        input.style.display = "none";
        document.body.append(input);
        input.click();
      });
    },
    async InspectEditionImport(id) {
      const value = requireJob(id);
      try {
        if (/<!DOCTYPE/i.test(source)) throw new Error("FORMAT_UNSUPPORTED");
        const xml = new DOMParser().parseFromString(source, "application/xml");
        if (
          xml.querySelector("parsererror") ||
          xml.documentElement.tagName !== "XMLBIBLE"
        )
          throw new Error("FORMAT_UNSUPPORTED");
        const d = await data();
        let total = 0;
        for (const book of xml.querySelectorAll("BIBLEBOOK")) {
          const b = d.books[Number(book.getAttribute("bnumber")) - 1];
          if (!b) throw new Error("REFERENCE_UNSUPPORTED");
          for (const ch of book.querySelectorAll("CHAPTER")) {
            const chapter = Number(ch.getAttribute("cnumber"));
            if (chapter < 1 || chapter > b.chapters)
              throw new Error("REFERENCE_UNSUPPORTED");
            for (const verse of ch.querySelectorAll("VERS")) {
              const label =
                (verse.getAttribute("vnumber") ||
                  verse.getAttribute("v") ||
                  "") +
                (verse.getAttribute("e") ? "-" + verse.getAttribute("e") : "");
              if (!/^[1-9]\d{0,2}[a-z]?(?:-[1-9]\d{0,2})?$/.test(label))
                throw new Error("REFERENCE_UNSUPPORTED");
              const copy = verse.cloneNode(true) as Element;
              for (const tag of copy.querySelectorAll("*")) {
                if (
                  !["NOTE", "XREF", "STYLE", "GRAM", "SUP", "BR"].includes(
                    tag.tagName,
                  )
                )
                  throw new Error("FORMAT_UNSUPPORTED");
              }
              copy.querySelectorAll("NOTE,XREF").forEach((n) => n.remove());
              copy.querySelectorAll("BR").forEach((n) => n.replaceWith("\n"));
              const text = (copy.textContent || "").trim();
              total += text.length;
              if (
                total > 5 << 20 ||
                draft.some(
                  (v) =>
                    v.book === b.id &&
                    v.chapter === chapter &&
                    v.label === label,
                )
              )
                throw new Error("INVALID_CONTENT");
              draft.push({ book: b.id, chapter, label, text });
            }
          }
        }
        if (!draft.length) throw new Error("INVALID_CONTENT");
        const hash = await fingerprint(JSON.stringify(draft));
        const report: EditionReport = {
          format: "zefania",
          profile: "Browser Mock fixture only",
          name:
            xml.documentElement.getAttribute("biblename") || "Local fixture",
          abbreviation:
            xml.querySelector("INFORMATION identifier")?.textContent || "LOCAL",
          language:
            xml.querySelector("INFORMATION language")?.textContent || "und",
          sourceEdition: xml.documentElement.getAttribute("revision") || "",
          sourceUrl: xml.querySelector("INFORMATION source")?.textContent || "",
          license:
            xml.querySelector("INFORMATION rights")?.textContent ||
            "No notice supplied",
          versification: "unknown",
          fingerprint: hash,
          sourceHash: await fingerprint(source),
          metadata: {},
          diagnostics: [
            "浏览器Mock测试文件；完整格式以桌面解析器为准 / Browser Mock fixture only",
            "编号体系未验证，仅单独阅读 / Unverified numbering; individual reading only",
          ],
          books: new Set(draft.map((v) => v.book)).size,
          chapters: new Set(draft.map((v) => v.book + v.chapter)).size,
          verses: draft.length,
        };
        value.report = report;
        value.samples = draft.slice(0, 5);
        value.status = "ready";
      } catch (e) {
        value.status = "failed";
        value.problem = {
          code: e instanceof Error ? e.message : "INVALID_CONTENT",
          position: "Browser Mock fixture",
        };
      }
      return structuredClone(value);
    },
    async GetEditionImportJob(id) {
      return structuredClone(requireJob(id));
    },
    async CancelEditionImport(id) {
      const value = requireJob(id);
      if (value.status !== "done") {
        value.status = "cancelled";
        value.report = undefined;
        draft = [];
      }
      return structuredClone(value);
    },
    async CommitEditionImport(id, options) {
      const value = requireJob(id);
      if (value.status === "done") return structuredClone(value);
      if (value.status !== "ready" || !value.report)
        throw new Error("DRAFT_EXPIRED");
      if (!options.name.trim() || !options.abbreviation.trim())
        throw new Error("INVALID_SETTINGS");
      const d = await data(),
        report = { ...value.report, ...options };
      const existing = saved.installs.find(
        (v) => saved.records[v.translation.id]?.[report.fingerprint],
      );
      if (existing) {
        value.installed = { id: existing.translation.id, duplicate: true };
      } else {
        const replaced = saved.installs.find(
          (v) => v.translation.id === options.replaceId,
        );
        if (options.replaceId && !replaced)
          throw new Error("INVALID_TRANSLATION");
        const editionID =
          replaced?.translation.id ||
          saved.tombstones[report.fingerprint] ||
          "user:" + crypto.randomUUID();
        const item: EditionInstall = {
          translation: {
            id: editionID,
            name: options.name,
            abbreviation: options.abbreviation,
            language: options.language,
            dataVersion: report.fingerprint,
            license: report.license,
            sourceUrl: report.sourceUrl,
            origin: "user",
            sourceFormat: report.format,
            sourceEdition: report.sourceEdition,
            versification: "unknown",
            comparable: false,
          },
          enabled: true,
          removing: false,
          report,
          versions: [
            {
              fingerprint: report.fingerprint,
              sourceEdition: report.sourceEdition,
              created: new Date().toISOString(),
            },
            ...(replaced?.versions || []),
          ],
          bytes: new TextEncoder().encode(JSON.stringify(draft)).length,
        };
        saved.records[editionID] ??= {};
        saved.records[editionID][report.fingerprint] = structuredClone(draft);
        saved.installs = saved.installs.filter(
          (v) => v.translation.id !== editionID,
        );
        saved.installs.push(item);
        value.installed = { id: editionID, duplicate: false };
      }
      value.status = "done";
      value.report = undefined;
      draft = [];
      source = "";
      persist();
      restoreMockEditions(d);
      return structuredClone(value);
    },
    async ListEditionInstalls() {
      await data();
      return structuredClone(saved.installs);
    },
    async SetEditionEnabled(id, enabled) {
      const item = saved.installs.find((v) => v.translation.id === id);
      if (!item) throw new Error("INVALID_TRANSLATION");
      item.enabled = enabled;
      persist();
      restoreMockEditions(await data());
      return true;
    },
    async RestoreEditionVersion(id, version) {
      const item = saved.installs.find((v) => v.translation.id === id);
      if (!item || !saved.records[id]?.[version])
        throw new Error("DATA_UNAVAILABLE");
      item.translation.dataVersion = version;
      persist();
      restoreMockEditions(await data());
      return true;
    },
    async RemoveEdition(id, purgeHighlights) {
      const item = saved.installs.find((v) => v.translation.id === id);
      if (!item) throw new Error("INVALID_TRANSLATION");
      for (const version of item.versions)
        saved.tombstones[version.fingerprint] = id;
      saved.installs = saved.installs.filter((v) => v.translation.id !== id);
      delete saved.records[id];
      if (purgeHighlights) purge(id);
      persist();
      restoreMockEditions(await data());
      return true;
    },
  };
}
