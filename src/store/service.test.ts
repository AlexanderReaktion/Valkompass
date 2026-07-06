import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryResponseStore } from "./memory.ts";
import { ConsentMissingError, grantConsent, retentionDeadline, storeAnalysis, storeComment } from "./service.ts";

const now = "2026-06-20T12:00:00.000Z";
let counter = 0;
const genId = () => `id-${++counter}`;

function freshStore() {
  counter = 0;
  return new MemoryResponseStore();
}

test("storeComment vägrar utan samtycke", async () => {
  const store = freshStore();
  await assert.rejects(
    () => storeComment(store, { sessionId: "s1", text: "min åsikt", now, genId }),
    ConsentMissingError,
  );
  assert.equal(store._commentsForTest().length, 0);
});

test("storeComment lagrar efter beviljat samtycke och sätter gallringsdatum", async () => {
  const store = freshStore();
  await grantConsent(store, {
    sessionId: "s1",
    type: "article9_freetext",
    granted: true,
    bannerVersion: "v1",
    now,
    genId,
  });
  const rec = await storeComment(store, { sessionId: "s1", text: "min åsikt", now, genId });
  assert.equal(rec.text, "min åsikt");
  assert.equal(rec.deleteAfter, retentionDeadline());
  assert.equal(store._commentsForTest().length, 1);
});

test("återkallat samtycke (senaste avgör) blockerar lagring", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now: "2026-06-20T10:00:00.000Z", genId });
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: false, bannerVersion: "v1", now: "2026-06-20T11:00:00.000Z", genId });
  await assert.rejects(() => storeComment(store, { sessionId: "s1", text: "x", now, genId }), ConsentMissingError);
});

test("samtycke är per session", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now, genId });
  assert.equal(await store.hasConsent("s1", "article9_freetext"), true);
  assert.equal(await store.hasConsent("s2", "article9_freetext"), false);
});

test("purgeExpired tar bort kommentarer efter gallringsdatum", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now, genId });
  await storeComment(store, { sessionId: "s1", text: "x", now, electionDay: "2026-09-13", genId });
  assert.equal(await store.purgeExpired("2026-09-13T12:00:00.000Z"), 0); // före deadline (23:59)
  assert.equal(await store.purgeExpired("2026-09-14T00:00:01.000Z"), 1); // efter deadline
  assert.equal(store._commentsForTest().length, 0);
});

test("storeAnalysis vägrar utan samtycke", async () => {
  const store = freshStore();
  await assert.rejects(
    () => storeAnalysis(store, { sessionId: "s1", schemaVersion: "3", inputHash: "abc", model: "m", analysis: {}, now, genId }),
    ConsentMissingError,
  );
  assert.equal((await store.exportBySession("s1")).analyses.length, 0);
});

test("storeAnalysis lagrar efter samtycke med metadata och gallringsdatum", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now, genId });
  const rec = await storeAnalysis(store, {
    sessionId: "s1",
    schemaVersion: "3",
    inputHash: "abc123",
    model: "claude-test",
    analysis: { summary: "s" },
    now,
    genId,
  });
  assert.equal(rec.schemaVersion, "3");
  assert.equal(rec.inputHash, "abc123");
  assert.equal(rec.deleteAfter, retentionDeadline());
  const dump = await store.exportBySession("s1");
  assert.equal(dump.analyses.length, 1);
  assert.deepEqual(dump.analyses[0]?.analysis, { summary: "s" });
});

test("purgeExpired tar även bort analyser efter gallringsdatum", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now, genId });
  await storeAnalysis(store, { sessionId: "s1", schemaVersion: "3", inputHash: "h", model: "m", analysis: {}, now, electionDay: "2026-09-13", genId });
  assert.equal(await store.purgeExpired("2026-09-13T12:00:00.000Z"), 0);
  assert.equal(await store.purgeExpired("2026-09-14T00:00:01.000Z"), 1);
  assert.equal((await store.exportBySession("s1")).analyses.length, 0);
});

test("save* med redan förekommande id ignoreras tyst (replay-tolerans)", async () => {
  const store = freshStore();
  await grantConsent(store, { sessionId: "s1", type: "article9_freetext", granted: true, bannerVersion: "v1", now, genId });
  const fixedId = () => "samma-id";
  await storeComment(store, { sessionId: "s1", text: "första", now, genId: fixedId });
  await storeComment(store, { sessionId: "s1", text: "replay", now, genId: fixedId });
  const comments = store._commentsForTest();
  assert.equal(comments.length, 1);
  assert.equal(comments[0]?.text, "första"); // först skriven vinner, som ON CONFLICT DO NOTHING
});

test("purgeExpired tar även bort sparade resultat efter gallringsdatum", async () => {
  const store = freshStore();
  await store.saveResult({
    id: "id-1",
    sessionId: "s1",
    catalogVersion: 1,
    method: "hybrid",
    canonicalAnswers: { q1: { value: 1, weight: 1 } },
    ranking: { matches: [] },
    createdAt: now,
    deleteAfter: "2026-09-13T23:59:59.999Z",
  });
  assert.equal(await store.purgeExpired("2026-09-13T12:00:00.000Z"), 0);
  assert.equal(await store.purgeExpired("2026-09-14T00:00:01.000Z"), 1);
});
