/**
 * Filbaserad store: samma logik som in-memory (ärver den), men varje mutation
 * skrivs atomiskt till disk och laddas vid uppstart. Syfte: lokala körningar
 * (utveckling, demo) ska lämna beständiga spår utan att kräva en databas.
 *
 * Produktion använder Postgres (DATABASE_URL). Den här adaptern är avsedd för
 * en enda process; skrivningen är atomisk (tmp + rename) så en krasch aldrig
 * lämnar en halvskriven fil.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CatalogQuestion, PartyPosition, PublishedCatalog } from "../catalog/types.ts";
import type { AnalysisRecord, CommentRecord, ConsentRecord, ResultRecord } from "./types.ts";
import { MemoryCatalogStore, MemoryResponseStore } from "./memory.ts";
import type { CatalogSnapshot, ResponsesSnapshot } from "./memory.ts";

function loadJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    // Fail fast: en korrupt fil ska stoppa appen med tydligt fel i stället för
    // att tyst skrivas över (= dataförlust) vid nästa mutation.
    throw new Error(`Korrupt store-fil ${filePath} – åtgärda eller ta bort den manuellt. (${String(e)})`);
  }
}

function saveJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), "utf8");
  renameSync(tmp, filePath);
}

export class FileCatalogStore extends MemoryCatalogStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    const snapshot = loadJson<CatalogSnapshot>(filePath);
    if (snapshot) this.hydrate(snapshot);
  }

  private persist(): void {
    saveJsonAtomic(this.filePath, this.snapshot());
  }

  override async savePublished(catalog: PublishedCatalog): Promise<void> {
    await super.savePublished(catalog);
    this.persist();
  }
  override async saveQuestion(q: CatalogQuestion): Promise<void> {
    await super.saveQuestion(q);
    this.persist();
  }
  override async savePosition(p: PartyPosition): Promise<void> {
    await super.savePosition(p);
    this.persist();
  }
}

export class FileResponseStore extends MemoryResponseStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    const snapshot = loadJson<ResponsesSnapshot>(filePath);
    if (snapshot) this.hydrate(snapshot);
  }

  private persist(): void {
    saveJsonAtomic(this.filePath, this.snapshot());
  }

  override async saveResult(r: ResultRecord): Promise<void> {
    await super.saveResult(r);
    this.persist();
  }
  override async saveComment(c: CommentRecord): Promise<void> {
    await super.saveComment(c);
    this.persist();
  }
  override async logConsent(c: ConsentRecord): Promise<void> {
    await super.logConsent(c);
    this.persist();
  }
  override async saveAnalysis(a: AnalysisRecord): Promise<void> {
    await super.saveAnalysis(a);
    this.persist();
  }
  override async purgeExpired(now: string): Promise<number> {
    const removed = await super.purgeExpired(now);
    if (removed > 0) this.persist();
    return removed;
  }
  override async deleteBySession(sessionId: string): Promise<number> {
    const removed = await super.deleteBySession(sessionId);
    if (removed > 0) this.persist();
    return removed;
  }
}

export interface FileStores {
  catalog: FileCatalogStore;
  responses: FileResponseStore;
}

/** Skapar katalogen vid behov och öppnar båda storefilerna. */
export function createFileStores(dir: string): FileStores {
  mkdirSync(dir, { recursive: true });
  return {
    catalog: new FileCatalogStore(join(dir, "catalog.json")),
    responses: new FileResponseStore(join(dir, "responses.json")),
  };
}
