/**
 * Store-fabrik: Postgres när DATABASE_URL är satt, annars in-memory.
 * Singleton så in-memory-data överlever mellan requests i utveckling.
 */

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
  } else {
    cached = { catalog: new MemoryCatalogStore(), responses: new MemoryResponseStore() };
  }
  return cached;
}
