import { test } from "node:test";
import assert from "node:assert/strict";

import type { CommentAnalysis } from "../analysis/types.ts";
import {
  ANALYSIS_STORE_VERSION,
  answersFingerprint,
  isAnalysisStale,
  parseStoredAnalysis,
  runFingerprint,
  serializeStoredAnalysis,
} from "./analysisStorage.ts";
import type { StoredAnalysis } from "./analysisStorage.ts";

const analysis: CommentAnalysis = {
  summary: "En sammanfattning.",
  themes: ["skatter"],
  sentiment: "mixed",
  relatedQuestionIds: ["q1"],
  policySignals: [{ dimension: "economic", leaning: "right", note: "n" }],
  commentInfluences: [{ sourceQuestionId: "q1", affectedQuestionIds: ["q2"], effect: "nuances_answer", note: "n" }],
  commentFlags: [{ commentIndex: 2, reason: "off topic" }],
  flagged: false,
  flagReason: "",
};

function stored(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return {
    version: ANALYSIS_STORE_VERSION,
    sessionId: "11111111-2222-4333-8444-555555555555",
    runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    answersFingerprint: answersFingerprint({ q1: [2, 1] }),
    runFingerprint: runFingerprint({ q1: [2, 1] }, { q1: "därför" }, "övergripande"),
    comments: { q1: "därför" },
    overallComment: "övergripande",
    analysis,
    analysisNote: null,
    excludedComments: [{ questionId: "q1" }, { questionId: null }],
    catalogVersion: 3,
    timestamp: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

test("answersFingerprint är oberoende av nyckelordning", () => {
  assert.equal(
    answersFingerprint({ b: [1, 1], a: [null, 2] }),
    answersFingerprint({ a: [null, 2], b: [1, 1] }),
  );
});

test("answersFingerprint ändras när värde eller vikt ändras", () => {
  const base = answersFingerprint({ a: [1, 1] });
  assert.notEqual(answersFingerprint({ a: [2, 1] }), base);
  assert.notEqual(answersFingerprint({ a: [1, 2] }), base);
  assert.notEqual(answersFingerprint({ a: [null, 1] }), base);
});

test("runFingerprint ignorerar tomma kommentarer och trimmar", () => {
  const a = { q1: [1, 1] } as const;
  assert.equal(
    runFingerprint(a, { q1: "  därför  ", q2: "   ", q3: "" }, " helhet "),
    runFingerprint(a, { q1: "därför" }, "helhet"),
  );
});

test("runFingerprint ändras när en kommentar redigeras, läggs till eller tas bort", () => {
  const a = { q1: [1, 1] } as const;
  const base = runFingerprint(a, { q1: "därför" }, "");
  assert.notEqual(runFingerprint(a, { q1: "därför inte" }, ""), base);
  assert.notEqual(runFingerprint(a, { q1: "därför", q2: "mer" }, ""), base);
  assert.notEqual(runFingerprint(a, {}, ""), base);
  assert.notEqual(runFingerprint(a, { q1: "därför" }, "ny helhet"), base);
});

test("runFingerprint ändras när svaren ändras", () => {
  const c = { q1: "därför" };
  assert.notEqual(runFingerprint({ q1: [1, 1] }, c, ""), runFingerprint({ q1: [2, 1] }, c, ""));
});

test("isAnalysisStale kräver ett tidigare avtryck och en skillnad", () => {
  assert.equal(isAnalysisStale(null, "x"), false);
  assert.equal(isAnalysisStale("x", "x"), false);
  assert.equal(isAnalysisStale("x", "y"), true);
});

test("serialize → parse är en identitetsresa", () => {
  const s = stored();
  assert.deepEqual(parseStoredAnalysis(serializeStoredAnalysis(s)), s);
});

test("parse accepterar analysis: null (t.ex. budgetnått läge) med note", () => {
  const s = stored({ analysis: null, analysisNote: "Dagens AI-budget är nådd." });
  assert.deepEqual(parseStoredAnalysis(serializeStoredAnalysis(s)), s);
});

test("parse avvisar trasig eller främmande payload", () => {
  assert.equal(parseStoredAnalysis(null), null);
  assert.equal(parseStoredAnalysis(""), null);
  assert.equal(parseStoredAnalysis("inte json"), null);
  assert.equal(parseStoredAnalysis("[1,2,3]"), null);
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), version: 99 })), null);
});

test("parse avvisar fel fälttyper", () => {
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), comments: { q1: 5 } })), null);
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), runId: 7 })), null);
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), excludedComments: [{ questionId: 3 }] })), null);
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), overallComment: null })), null);
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), catalogVersion: "2026" })), null);
});

test("parse avvisar en analys som inte matchar schema v3-formen", () => {
  const broken = { ...analysis, summary: 42 };
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), analysis: broken })), null);
  const noFlags = { ...analysis } as Record<string, unknown>;
  delete noFlags.commentFlags;
  assert.equal(parseStoredAnalysis(JSON.stringify({ ...stored(), analysis: noFlags })), null);
});
