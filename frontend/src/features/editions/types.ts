import type { Translation } from "../../shared/types";
export interface EditionRecord {
  book: string;
  chapter: number;
  label: string;
  text: string;
}
export interface EditionReport {
  format: string;
  profile: string;
  name: string;
  abbreviation: string;
  language: string;
  sourceEdition: string;
  sourceUrl: string;
  license: string;
  versification: string;
  fingerprint: string;
  sourceHash: string;
  metadata: Record<string, string>;
  diagnostics: string[];
  books: number;
  chapters: number;
  verses: number;
}
export interface EditionInstall {
  translation: Translation;
  enabled: boolean;
  removing: boolean;
  report: EditionReport;
  bytes: number;
  versions: { fingerprint: string; sourceEdition: string; created: string }[];
}
export interface EditionCommit {
  name: string;
  abbreviation: string;
  language: string;
  replaceId: string;
}
export interface EditionJob {
  id: string;
  status:
    | "queued"
    | "inspecting"
    | "ready"
    | "committing"
    | "done"
    | "failed"
    | "cancelled";
  report?: EditionReport;
  samples: EditionRecord[];
  problem?: { code: string; position: string };
  installed?: { id: string; duplicate: boolean };
}
export interface EditionAPI {
  ChooseEditionImport(): Promise<{
    token: string;
    name: string;
    cancelled: boolean;
  }>;
  InspectEditionImport(token: string): Promise<EditionJob>;
  GetEditionImportJob(id: string): Promise<EditionJob>;
  CancelEditionImport(id: string): Promise<EditionJob>;
  CommitEditionImport(id: string, options: EditionCommit): Promise<EditionJob>;
  ListEditionInstalls(): Promise<EditionInstall[]>;
  SetEditionEnabled(id: string, enabled: boolean): Promise<boolean>;
  RestoreEditionVersion(id: string, version: string): Promise<boolean>;
  RemoveEdition(id: string, purgeHighlights: boolean): Promise<boolean>;
}
