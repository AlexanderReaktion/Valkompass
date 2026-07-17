import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileResponseStore, createFileStores } from "./file.ts";
import type { ResultRecord } from "./types.ts";

const now = "2026-07-17T10:00:00.000Z";
const later = "2026-09-14T00:00:00.000Z";

function mkResult(id: string, sessionId: string): ResultRecord {
  return {
    id,
    sessionId,
    catalogVersion: 5,
    method: "hybrid",
    canonicalAnswers: { straff: { value: 2, weight: 1 } },
    ranking: { matches: [] },
    createdAt: now,
    deleteAfter: later,
  };
}

test("filstore: data överlever att storen öppnas på nytt (simulerad omstart)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valkompass-store-"));
  const first = createFileStores(dir);

  await first.responses.logConsent({
    id: "consent-1", sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", createdAt: now,
  });
  await first.responses.saveResult(mkResult("r1", "s1"));
  await first.responses.saveComment({ id: "c1", sessionId: "s1", text: "test", createdAt: now, deleteAfter: later });
  await first.responses.saveAnalysis({
    id: "a1", sessionId: "s1", schemaVersion: "3", inputHash: "abc", model: "m", analysis: { summary: "x" },
    createdAt: now, deleteAfter: later,
  });

  // "Omstart": nya instanser mot samma katalog läser tillbaka allt från disk.
  const second = createFileStores(dir);
  const exported = await second.responses.exportBySession("s1");
  assert.equal(exported.results.length, 1);
  assert.equal(exported.comments.length, 1);
  assert.equal(exported.consents.length, 1);
  assert.equal(exported.analyses.length, 1);
  assert.equal(exported.analyses[0]!.model, "m");
  assert.equal(await second.responses.hasConsent("s1", "article9_freetext"), true);
});

test("filstore: radering och gallring persisteras också", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valkompass-store-"));
  const first = createFileStores(dir);
  await first.responses.saveResult(mkResult("r1", "s1"));
  await first.responses.saveResult({ ...mkResult("r2", "s2"), deleteAfter: "2026-01-01T00:00:00.000Z" });

  assert.equal(await first.responses.purgeExpired(now), 1); // r2 gallras
  assert.equal(await first.responses.deleteBySession("s1"), 1); // r1 raderas (DSAR)

  const second = createFileStores(dir);
  assert.deepEqual(await second.responses.listResults(), []);
});

test("filstore: katalogpublicering överlever omstart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valkompass-store-"));
  const first = createFileStores(dir);
  await first.catalog.savePublished({
    version: 5, election: "riksdagsval-2026", publishedAt: now, scale: { min: -2, max: 2 }, questions: [],
  });

  const second = createFileStores(dir);
  const published = await second.catalog.getPublished("riksdagsval-2026");
  assert.equal(published?.version, 5);
});

test("filstore: korrupt fil stoppar uppstarten i stället för att skrivas över", () => {
  const dir = mkdtempSync(join(tmpdir(), "valkompass-store-"));
  writeFileSync(join(dir, "responses.json"), "{trasig json", "utf8");
  assert.throws(() => new FileResponseStore(join(dir, "responses.json")), /Korrupt store-fil/);
});
