import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryCatalogStore, MemoryResponseStore } from "./memory.ts";
import { rowToAnalysis, rowToComment, rowToPosition, rowToQuestion } from "./postgres.ts";
import type { PublishedCatalog } from "../catalog/types.ts";

// ---------- rowTo* mappers ----------

test("rowToQuestion: Date->ISO, valbara fält och enum-vakt", () => {
  const created = new Date("2026-01-02T03:04:05.000Z");
  const approved = new Date("2026-02-03T04:05:06.000Z");
  const q = rowToQuestion({
    id: "q1",
    kind: "dynamic",
    text: "Påstående?",
    dimension: "economic",
    polarity: -1,
    topic: "skatt",
    status: "approved",
    rationale: "skiljelinje",
    sources: [{ label: "Riksdagen" }],
    created_at: created,
    approved_by: "admin",
    approved_at: approved,
  });
  assert.equal(q.id, "q1");
  assert.equal(q.kind, "dynamic");
  assert.equal(q.dimension, "economic");
  assert.equal(q.polarity, -1);
  assert.equal(q.status, "approved");
  assert.equal(q.rationale, "skiljelinje");
  assert.equal(q.createdAt, "2026-01-02T03:04:05.000Z");
  assert.equal(q.approvedBy, "admin");
  assert.equal(q.approvedAt, "2026-02-03T04:05:06.000Z");
});

test("rowToQuestion: null/utelämnade valfria fält tas bort, polarity normaliseras till 1", () => {
  const q = rowToQuestion({
    id: "q2",
    kind: "structural",
    text: "Annat?",
    dimension: null,
    polarity: 0, // ogiltig polaritet normaliseras till 1
    topic: "frihet",
    status: "draft",
    rationale: null,
    sources: null,
    created_at: "2026-01-01T00:00:00.000Z",
    approved_by: null,
    approved_at: null,
  });
  assert.equal("dimension" in q, false);
  assert.equal("rationale" in q, false);
  assert.equal("approvedBy" in q, false);
  assert.equal("approvedAt" in q, false);
  assert.equal(q.polarity, 1);
  assert.deepEqual(q.sources, []);
});

test("rowToQuestion: enum-vakt kastar vid ogiltig kind/status/dimension", () => {
  const base = {
    id: "q3",
    text: "x",
    polarity: 1,
    topic: "t",
    sources: [],
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.throws(() => rowToQuestion({ ...base, kind: "bogus", status: "draft" }), /kind/);
  assert.throws(() => rowToQuestion({ ...base, kind: "dynamic", status: "bogus" }), /status/);
  assert.throws(
    () => rowToQuestion({ ...base, kind: "dynamic", status: "draft", dimension: "bogus" }),
    /dimension/,
  );
});

test("rowToPosition: typer, citations-default och enum-vakt på status", () => {
  const p = rowToPosition({
    question_id: "q1",
    party_id: "S",
    value: "1.5",
    citations: null,
    status: "approved",
    approved_by: null,
    approved_at: new Date("2026-03-04T05:06:07.000Z"),
  });
  assert.equal(p.questionId, "q1");
  assert.equal(p.partyId, "S");
  assert.equal(p.value, 1.5);
  assert.deepEqual(p.citations, []);
  assert.equal(p.status, "approved");
  assert.equal("approvedBy" in p, false);
  assert.equal(p.approvedAt, "2026-03-04T05:06:07.000Z");
  assert.throws(() => rowToPosition({ ...p, status: "bogus", question_id: "q1", party_id: "S", value: 1 }), /status/);
});

test("rowToComment: Date->ISO, valfri questionId/analysis", () => {
  const withAll = rowToComment({
    id: "c1",
    session_id: "s1",
    question_id: "q1",
    text: "min åsikt",
    analysis: { tone: "neutral" },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    delete_after: new Date("2026-09-13T23:59:59.999Z"),
  });
  assert.equal(withAll.questionId, "q1");
  assert.deepEqual(withAll.analysis, { tone: "neutral" });
  assert.equal(withAll.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(withAll.deleteAfter, "2026-09-13T23:59:59.999Z");

  const minimal = rowToComment({
    id: "c2",
    session_id: "s1",
    question_id: null,
    text: "övergripande",
    analysis: null,
    created_at: "2026-01-01T00:00:00.000Z",
    delete_after: "2026-09-13T23:59:59.999Z",
  });
  assert.equal("questionId" in minimal, false);
  assert.equal("analysis" in minimal, false);
});

test("rowToAnalysis: Date->ISO och payload som analysis", () => {
  const a = rowToAnalysis({
    id: "a1",
    session_id: "s1",
    schema_version: "3",
    input_hash: "deadbeef",
    model: "claude-test",
    payload: { summary: "s", flagged: false },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    delete_after: new Date("2026-09-13T23:59:59.999Z"),
  });
  assert.equal(a.id, "a1");
  assert.equal(a.sessionId, "s1");
  assert.equal(a.schemaVersion, "3");
  assert.equal(a.inputHash, "deadbeef");
  assert.equal(a.model, "claude-test");
  assert.deepEqual(a.analysis, { summary: "s", flagged: false });
  assert.equal(a.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(a.deleteAfter, "2026-09-13T23:59:59.999Z");
});

// ---------- MemoryCatalogStore versionsval ----------

function catalog(version: number): PublishedCatalog {
  return {
    version,
    election: "riksdagsval-2026",
    publishedAt: `2026-0${version}-01T00:00:00.000Z`,
    scale: { min: -2, max: 2 },
    questions: [],
  };
}

test("MemoryCatalogStore.getPublished returnerar högsta versionen (speglar Postgres)", async () => {
  const store = new MemoryCatalogStore();
  assert.equal(await store.getPublished("riksdagsval-2026"), null);
  await store.savePublished(catalog(1));
  await store.savePublished(catalog(3));
  await store.savePublished(catalog(2)); // sparas i fel ordning med flit
  const got = await store.getPublished("riksdagsval-2026");
  assert.equal(got?.version, 3);
  // Annat val påverkas inte.
  assert.equal(await store.getPublished("eu-val-2024"), null);
});

// ---------- DSAR på MemoryResponseStore ----------

const now = "2026-06-20T12:00:00.000Z";
const deleteAfter = "2026-09-13T23:59:59.999Z";

function seed(store: MemoryResponseStore, sessionId: string) {
  return Promise.all([
    store.saveResult({
      id: `r-${sessionId}`,
      sessionId,
      catalogVersion: 1,
      method: "hybrid",
      canonicalAnswers: { q1: { value: 1, weight: 1 } },
      ranking: { matches: [] },
      createdAt: now,
      deleteAfter,
    }),
    store.saveComment({ id: `c-${sessionId}`, sessionId, text: "x", createdAt: now, deleteAfter }),
    store.saveAnalysis({
      id: `a-${sessionId}`,
      sessionId,
      schemaVersion: "3",
      inputHash: "h",
      model: "m",
      analysis: {},
      createdAt: now,
      deleteAfter,
    }),
    store.logConsent({
      id: `k-${sessionId}`,
      sessionId,
      type: "article9_freetext",
      granted: true,
      bannerVersion: "v1",
      createdAt: now,
    }),
  ]);
}

test("exportBySession returnerar bara den efterfrågade sessionens rader", async () => {
  const store = new MemoryResponseStore();
  await seed(store, "s1");
  await seed(store, "s2");
  const dump = await store.exportBySession("s1");
  assert.equal(dump.results.length, 1);
  assert.equal(dump.comments.length, 1);
  assert.equal(dump.consents.length, 1);
  assert.equal(dump.analyses.length, 1);
  assert.equal(dump.results[0]?.sessionId, "s1");
  assert.equal(dump.consents[0]?.sessionId, "s1");
  assert.equal(dump.analyses[0]?.sessionId, "s1");
});

test("deleteBySession tar bort resultat+kommentar+analys+samtycke och returnerar antal", async () => {
  const store = new MemoryResponseStore();
  await seed(store, "s1");
  await seed(store, "s2");
  const removed = await store.deleteBySession("s1");
  assert.equal(removed, 4);
  const dump = await store.exportBySession("s1");
  assert.equal(dump.results.length, 0);
  assert.equal(dump.comments.length, 0);
  assert.equal(dump.consents.length, 0);
  assert.equal(dump.analyses.length, 0);
  // s2 är orörd.
  const other = await store.exportBySession("s2");
  assert.equal(other.results.length, 1);
  assert.equal(other.comments.length, 1);
  assert.equal(other.consents.length, 1);
  assert.equal(other.analyses.length, 1);
  // Idempotent: ingen kvar att radera.
  assert.equal(await store.deleteBySession("s1"), 0);
});
