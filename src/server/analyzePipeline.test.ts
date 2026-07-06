import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { runAnalyze } from "./analyzePipeline.ts";
import type { AnalyzeDeps } from "./analyzePipeline.ts";
import { MemoryResponseStore } from "../store/memory.ts";
import type { ActiveDataset } from "../data/activeCatalog.ts";
import type { CatalogQuestion } from "../catalog/types.ts";
import type { AnalyzeInput, CommentAnalysis, CommentAnalyzer } from "../analysis/types.ts";
import { ANALYSIS_SCHEMA_VERSION } from "../analysis/types.ts";
import { buildAnalysisUserMessage } from "../analysis/prompt.ts";

// ---------- fixtur ----------

const SESSION = "11111111-2222-4333-8444-555555555555";
const RUN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const scale = { min: -2, max: 2 };

function q(id: string, text: string, dimension: "economic" | "galtan"): CatalogQuestion {
  return { id, kind: "dynamic", text, dimension, polarity: 1, topic: "t", status: "approved", sources: [], createdAt: "2026-01-01T00:00:00.000Z" };
}

const dataset: ActiveDataset = {
  catalog: {
    version: 1,
    election: "riksdagsval-2026",
    publishedAt: "2026-06-17T00:00:00.000Z",
    scale,
    questions: [q("q_skatt", "Skatten på arbete bör sänkas.", "economic"), q("q_migration", "Migrationen bör minska.", "galtan")],
  },
  parties: [
    { id: "M", name: "Moderaterna", positions: { q_skatt: 2, q_migration: 1 } },
    { id: "S", name: "Socialdemokraterna", positions: { q_skatt: -1, q_migration: -1 } },
  ],
  scale,
  sources: {},
  isPublished: true,
};

const cleanAnalysis: CommentAnalysis = {
  summary: "s",
  themes: ["skatt"],
  sentiment: "neutral",
  relatedQuestionIds: ["q_skatt"],
  policySignals: [],
  commentInfluences: [],
  commentFlags: [],
  flagged: false,
  flagReason: "",
};

function fakeAnalyzer(out: CommentAnalysis): { analyzer: CommentAnalyzer; calls: () => number; last: () => AnalyzeInput | null } {
  let calls = 0;
  let captured: AnalyzeInput | null = null;
  return {
    analyzer: { async analyze(input) { calls += 1; captured = input; return out; } },
    calls: () => calls,
    last: () => captured,
  };
}

function makeDeps(overrides: Partial<AnalyzeDeps> = {}): { deps: AnalyzeDeps; store: MemoryResponseStore } {
  const store = new MemoryResponseStore();
  const deps: AnalyzeDeps = {
    dataset,
    responses: store,
    analyzer: fakeAnalyzer(cleanAnalysis).analyzer,
    model: "claude-test",
    allowAiCall: async () => true,
    bannerVersion: "v1",
    ...overrides,
  };
  return { deps, store };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: SESSION,
    answers: { q_skatt: { value: 2, weight: 2 }, q_migration: { value: null, weight: 1 } },
    comments: [
      { questionId: "q_skatt", text: "sänk skatten rejält" },
      { text: "övergripande fundering" },
    ],
    consent: { article9: true },
    runId: RUN,
    ...overrides,
  };
}

type ResponseBody = {
  ranking: { matches: { partyId: string }[] };
  userCoords: Record<string, number | null>;
  analysis: CommentAnalysis | null;
  analysisNote: string | null;
  aiGenerated: boolean;
  excludedComments: { questionId: string | null }[];
  runId: string | null;
};

const asBody = (v: unknown): ResponseBody => v as ResponseBody;

// ---------- input till modellen ----------

test("skalsvar i ord, koordinater och per-dimension-matchning når analyzern", async () => {
  const fake = fakeAnalyzer(cleanAnalysis);
  const { deps } = makeDeps({ analyzer: fake.analyzer });
  const res = await runAnalyze(body(), deps);
  assert.equal(res.status, 200);

  const input = fake.last()!;
  assert.deepEqual(input.answers, [
    { questionId: "q_skatt", questionText: "Skatten på arbete bör sänkas.", stance: "instämmer helt", weight: 2, hasComment: true },
    { questionId: "q_migration", questionText: "Migrationen bör minska.", stance: "vet ej", weight: 1, hasComment: false },
  ]);
  assert.equal(input.userCoordinates?.economic, 1);
  // Toppmatchningen (M, full träff på ekonomifrågan) får per-dimension-procent;
  // galtan är null eftersom frågan besvarades "vet ej".
  assert.equal(input.topMatches[0]?.partyId, "M");
  assert.equal(input.topMatches[0]?.economicPercent, 100);
  assert.equal(input.topMatches[0]?.galtanPercent, null);
  // Kommentarsetiketten i prompten innehåller både id och frågetext.
  assert.match(buildAnalysisUserMessage(input), /\[fråga q_skatt: "Skatten på arbete bör sänkas\."\]/);
});

// ---------- idempotens ----------

test("dubbel-POST med samma runId ger en resultatrad och inga dubblettkommentarer/samtycken", async () => {
  const fake = fakeAnalyzer(cleanAnalysis);
  const { deps, store } = makeDeps({ analyzer: fake.analyzer });

  const first = await runAnalyze(body(), deps);
  const second = await runAnalyze(body(), deps);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(asBody(second.body).runId, RUN);

  const dump = await store.exportBySession(SESSION);
  assert.equal(dump.results.length, 1);
  assert.equal(dump.results[0]?.id, RUN);
  assert.equal(dump.comments.length, 2);
  assert.equal(dump.consents.length, 1);
  assert.equal(dump.analyses.length, 1);
  // Retry-vägen FÅR köra om AI-anropet.
  assert.equal(fake.calls(), 2);
});

test("ogiltigt runId ger 400", async () => {
  const { deps } = makeDeps();
  const res = await runAnalyze(body({ runId: "inte-ett-uuid" }), deps);
  assert.equal(res.status, 400);
});

test("utan runId slumpas id:n (två POST ger två resultatrader)", async () => {
  const { deps, store } = makeDeps();
  await runAnalyze(body({ runId: undefined }), deps);
  await runAnalyze(body({ runId: undefined }), deps);
  const dump = await store.exportBySession(SESSION);
  assert.equal(dump.results.length, 2);
  assert.equal((await runAnalyze(body({ runId: undefined }), deps)).status, 200);
});

// ---------- durabilitet ----------

test("kommentarer är durabla när AI-anropet kastar; svaret blir ändå 200 med notis", async () => {
  const throwing: CommentAnalyzer = { async analyze() { throw new Error("nätverksfel"); } };
  const { deps, store } = makeDeps({ analyzer: throwing });
  const res = await runAnalyze(body(), deps);
  assert.equal(res.status, 200);
  const b = asBody(res.body);
  assert.equal(b.analysis, null);
  assert.equal(b.aiGenerated, false);
  assert.equal(b.analysisNote, "AI-analysen kunde inte slutföras just nu.");
  // Kommentarerna lagrades FÖRE AI-anropet.
  assert.equal(store._commentsForTest().length, 2);
  assert.equal((await store.exportBySession(SESSION)).analyses.length, 0);
});

// ---------- commentFlags ----------

test("partiellt flaggade kommentarer: analysen visas, excludedComments + notis namnger frågan", async () => {
  const withFlag: CommentAnalysis = { ...cleanAnalysis, commentFlags: [{ commentIndex: 1, reason: "spam" }] };
  const { deps } = makeDeps({ analyzer: fakeAnalyzer(withFlag).analyzer });
  const res = await runAnalyze(body(), deps);
  const b = asBody(res.body);
  assert.ok(b.analysis);
  assert.equal(b.aiGenerated, true);
  assert.deepEqual(b.excludedComments, [{ questionId: "q_skatt" }]);
  assert.equal(b.analysisNote, 'Kommentaren på frågan "Skatten på arbete bör sänkas." visas inte i analysen.');
  // Kommentartexten får ALDRIG ekas i notisen.
  assert.doesNotMatch(b.analysisNote!, /sänk skatten/);
});

test("flaggad övergripande kommentar namnges som den övergripande kommentaren", async () => {
  const withFlag: CommentAnalysis = { ...cleanAnalysis, commentFlags: [{ commentIndex: 2, reason: "spam" }] };
  const { deps } = makeDeps({ analyzer: fakeAnalyzer(withFlag).analyzer });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.deepEqual(b.excludedComments, [{ questionId: null }]);
  assert.equal(b.analysisNote, "Den övergripande kommentaren visas inte i analysen.");
});

test("alla kommentarer flaggade: flagged=true-vägen ger ingen analys men persisterar den", async () => {
  const allFlagged: CommentAnalysis = {
    ...cleanAnalysis,
    commentFlags: [{ commentIndex: 1, reason: "hat" }, { commentIndex: 2, reason: "spam" }],
    flagged: true,
    flagReason: "alla kommentarer olämpliga",
  };
  const { deps, store } = makeDeps({ analyzer: fakeAnalyzer(allFlagged).analyzer });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.equal(b.analysis, null);
  assert.equal(b.aiGenerated, false);
  assert.equal(b.analysisNote, "En eller flera kommentarer flaggades och visas inte.");
  assert.equal(b.excludedComments.length, 2);
  // Även flaggad analys lagras (under samtycke, med retention).
  const dump = await store.exportBySession(SESSION);
  assert.equal(dump.analyses.length, 1);
  assert.equal((dump.analyses[0]?.analysis as CommentAnalysis).flagged, true);
});

test("commentFlags utanför intervallet filtreras bort server-side", async () => {
  const outOfRange: CommentAnalysis = { ...cleanAnalysis, commentFlags: [{ commentIndex: 99, reason: "x" }] };
  const { deps } = makeDeps({ analyzer: fakeAnalyzer(outOfRange).analyzer });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.deepEqual(b.excludedComments, []);
  assert.deepEqual(b.analysis?.commentFlags, []);
  assert.equal(b.analysisNote, null);
});

// ---------- sanering av modell-id:n ----------

test("okända fråge-id:n från modellen filtreras tyst", async () => {
  const dirty: CommentAnalysis = {
    ...cleanAnalysis,
    relatedQuestionIds: ["q_skatt", "hittepa_id"],
    commentInfluences: [
      { sourceQuestionId: "hittepa_id", affectedQuestionIds: ["q_skatt", "annat_hittepa"], effect: "adds_priority", note: "n" },
    ],
  };
  const { deps } = makeDeps({ analyzer: fakeAnalyzer(dirty).analyzer });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.deepEqual(b.analysis?.relatedQuestionIds, ["q_skatt"]);
  assert.deepEqual(b.analysis?.commentInfluences[0]?.affectedQuestionIds, ["q_skatt"]);
  assert.equal(b.analysis?.commentInfluences[0]?.sourceQuestionId, undefined);
});

// ---------- persistens av analysen ----------

test("analysen persisteras med schemaVersion + inputHash; export inkluderar och delete raderar", async () => {
  const fake = fakeAnalyzer(cleanAnalysis);
  const { deps, store } = makeDeps({ analyzer: fake.analyzer });
  await runAnalyze(body(), deps);

  const dump = await store.exportBySession(SESSION);
  assert.equal(dump.analyses.length, 1);
  const rec = dump.analyses[0]!;
  assert.equal(rec.schemaVersion, ANALYSIS_SCHEMA_VERSION);
  assert.equal(rec.model, "claude-test");
  const expectedHash = createHash("sha256").update(buildAnalysisUserMessage(fake.last()!), "utf8").digest("hex");
  assert.equal(rec.inputHash, expectedHash);
  assert.ok(rec.deleteAfter > rec.createdAt);

  // DSAR: radering tar även analysen (1 resultat + 2 kommentarer + 1 samtycke + 1 analys).
  assert.equal(await store.deleteBySession(SESSION), 5);
  assert.equal((await store.exportBySession(SESSION)).analyses.length, 0);
});

// ---------- degraderingar ----------

test("AI ej konfigurerad: neutral notis utan env-varnamn, kommentarer lagras ändå", async () => {
  const { deps, store } = makeDeps({ analyzer: null });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.equal(b.analysisNote, "AI-analysen är inte tillgänglig just nu.");
  assert.doesNotMatch(b.analysisNote!, /ANTHROPIC/);
  assert.equal(store._commentsForTest().length, 2);
});

test("AI-budgeten nådd: analysen hoppas över men kommentarerna lagras", async () => {
  const { deps, store } = makeDeps({ allowAiCall: async () => false });
  const b = asBody((await runAnalyze(body(), deps)).body);
  assert.equal(b.analysis, null);
  assert.match(b.analysisNote!, /AI-budget/);
  assert.equal(store._commentsForTest().length, 2);
});

test("kommentarer utan art. 9-samtycke avvisas med 400", async () => {
  const { deps, store } = makeDeps();
  const res = await runAnalyze(body({ consent: undefined }), deps);
  assert.equal(res.status, 400);
  assert.equal(store._commentsForTest().length, 0);
});

test("utan kommentarer lagras ingenting och svaret innehåller de nya fälten", async () => {
  const { deps, store } = makeDeps();
  const res = await runAnalyze(body({ comments: [], runId: undefined }), deps);
  assert.equal(res.status, 200);
  const b = asBody(res.body);
  assert.equal(b.analysis, null);
  assert.deepEqual(b.excludedComments, []);
  assert.equal(b.runId, null);
  const dump = await store.exportBySession(SESSION);
  assert.equal(dump.results.length + dump.comments.length + dump.consents.length + dump.analyses.length, 0);
});
