/**
 * Store-fabrik: Postgres när DATABASE_URL är satt; annars filbaserad store
 * (./.data) så lokala körningar överlever omstart; in-memory bara på
 * serverless utan databas (filsystemet är efemärt där ändå).
 */

import { join } from "node:path";

import { MemoryCatalogStore, MemoryResponseStore } from "./memory.ts";
import type { CatalogStore, ResponseStore } from "./types.ts";

export interface Stores {
  catalog: CatalogStore;
  responses: ResponseStore;
}

let cached: Stores | null = null;

export async function getStores(): Promise<Stores> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (url) {
    const { createPostgresStores } = await import("./postgres.ts");
    cached = createPostgresStores(url);
  } else if (process.env.VERCEL) {
    // Serverless utan databas: disk är efemär och instanser delar inget –
    // in-memory är då ärligare än en fil som låtsas vara beständig.
    cached = { catalog: new MemoryCatalogStore(), responses: new MemoryResponseStore() };
  } else {
    const { createFileStores } = await import("./file.ts");
    cached = createFileStores(process.env.FILE_STORE_DIR ?? join(process.cwd(), ".data"));
  }
  return cached;
}
