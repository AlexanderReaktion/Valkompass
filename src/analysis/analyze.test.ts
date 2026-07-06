import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeComment, buildAnswerSummaries, isPresentable, sanitizeAnalysis } from "./analyze.ts";
import type { AnalyzeInput, CommentAnalysis, CommentAnalyzer } from "./types.ts";
import type { PartyMatch, RankedResult } from "../matching/types.ts";

function match(partyId: string, percent: number): PartyMatch {
  return { partyId, partyName: partyId, method: "hybrid", percent, answeredCount: 3, breakdown: [] };
}

const ranking: RankedResult = {
  method: "hybrid",
  matches: [match("M", 90), match("L", 80), match("KD", 70), match("C", 50)],
  topGap: 10,
  isClose: false,
};

const baseAnalysis: CommentAnalysis = {
  summary: "x",
  themes: ["skatt"],
  sentiment: "neutral",
  relatedQuestionIds: ["q1"],
  policySignals: [{ dimension: "economic", leaning: "right", note: "n" }],
  commentInfluences: [{ sourceQuestionId: "q1", affectedQuestionIds: ["q1"], effect: "adds_priority", note: "Skatt lyfts som särskilt viktig." }],
  commentFlags: [],
  flagged: false,
  flagReason: "",
};

function capturingAnalyzer(out: CommentAnalysis): { analyzer: CommentAnalyzer; last: () => AnalyzeInput | null } {
  let captured: AnalyzeInput | null = null;
  return {
    analyzer: { async analyze(input) { captured = input; return out; } },
    last: () => captured,
  };
}

test("inga (eller tomma) kommentarer kastar fel", async () => {
  const { analyzer } = capturingAnalyzer(baseAnalysis);
  await assert.rejects(
    () => analyzeComment({ comments: [{ text: "   " }], ranking, questions: [], analyzer }),
    /Inga kommentarer/,
  );
});

test("väger in flera per-fråga-kommentarer, trimmar och behåller frågekoppling", async () => {
  const { analyzer, last } = capturingAnalyzer(baseAnalysis);
  await analyzeComment({
    comments: [
      { questionId: "q1", questionText: "Skatt?", text: "  viktigt  " },
      { text: "övergripande" },
      { questionId: "q2", text: "   " }, // tom → ska filtreras bort
    ],
    ranking,
    questions: [{ id: "q1", text: "Skatt?" }],
    analyzer,
  });
  const input = last()!;
  assert.equal(input.comments.length, 2);
  assert.deepEqual(input.comments[0], { questionId: "q1", questionText: "Skatt?", text: "viktigt" });
  assert.equal(input.comments[1]!.text, "övergripande");
  assert.equal(input.comments[1]!.questionId, undefined);
  assert.equal(input.topMatches.length, 3);
});

test("skalsvar, koordinater och per-dimension-matchning når analyzer-inputen", async () => {
  const { analyzer, last } = capturingAnalyzer(baseAnalysis);
  const answers = [
    { questionId: "q1", questionText: "Skatt?", stance: "instämmer helt" as const, weight: 2, hasComment: true },
    { questionId: "q2", questionText: "Bidrag?", stance: "vet ej" as const, weight: 1, hasComment: false },
  ];
  await analyzeComment({
    comments: [{ questionId: "q1", questionText: "Skatt?", text: "viktigt" }],
    ranking,
    questions: [{ id: "q1", text: "Skatt?" }],
    analyzer,
    answers,
    userCoordinates: { economic: 0.5, galtan: -0.25 },
    partyDimensions: { M: { economic: 95, galtan: 60 } },
  });
  const input = last()!;
  assert.deepEqual(input.answers, answers);
  assert.deepEqual(input.userCoordinates, { economic: 0.5, galtan: -0.25 });
  assert.deepEqual(input.topMatches[0], { partyId: "M", partyName: "M", percent: 90, economicPercent: 95, galtanPercent: 60 });
  // L saknar partyDimensions → inga dimensionsfält.
  assert.equal("economicPercent" in input.topMatches[1]!, false);
});

test("utan answers-argument blir input.answers en tom lista", async () => {
  const { analyzer, last } = capturingAnalyzer(baseAnalysis);
  await analyzeComment({ comments: [{ text: "hej" }], ranking, questions: [], analyzer });
  assert.deepEqual(last()!.answers, []);
});

test("buildAnswerSummaries: hållning i ord på visningsvärdet, vet ej och kommentarsflagga", () => {
  const scale = { min: -2, max: 2 };
  const out = buildAnswerSummaries({
    display: {
      q1: { value: 2, weight: 2 },
      q2: { value: null, weight: 1 },
      q3: { value: -1 },
    },
    questions: [
      { id: "q1", text: "Skatten bör sänkas." },
      { id: "q2", text: "Bidragen bör höjas." },
      { id: "q3", text: "Kärnkraften bör byggas ut." },
      { id: "q4", text: "Obesvarad fråga." }, // ej i display → utelämnas
    ],
    scale,
    commentedQuestionIds: new Set(["q1"]),
  });
  assert.deepEqual(out, [
    { questionId: "q1", questionText: "Skatten bör sänkas.", stance: "instämmer helt", weight: 2, hasComment: true },
    { questionId: "q2", questionText: "Bidragen bör höjas.", stance: "vet ej", weight: 1, hasComment: false },
    { questionId: "q3", questionText: "Kärnkraften bör byggas ut.", stance: "tar delvis avstånd", weight: 1, hasComment: false },
  ]);
});

test("sanitizeAnalysis filtrerar okända fråge-id:n från modellen", () => {
  const valid = new Set(["q1", "q2"]);
  const dirty: CommentAnalysis = {
    ...baseAnalysis,
    relatedQuestionIds: ["q1", "påhittad", "q2"],
    commentInfluences: [
      { sourceQuestionId: "påhittad", affectedQuestionIds: ["q1", "bogus"], effect: "adds_priority", note: "n" },
      { sourceQuestionId: "q2", affectedQuestionIds: ["q2"], effect: "reinforces_answer", note: "n" },
    ],
  };
  const clean = sanitizeAnalysis(dirty, valid, 1);
  assert.deepEqual(clean.relatedQuestionIds, ["q1", "q2"]);
  assert.equal("sourceQuestionId" in clean.commentInfluences[0]!, false);
  assert.deepEqual(clean.commentInfluences[0]!.affectedQuestionIds, ["q1"]);
  assert.equal(clean.commentInfluences[1]!.sourceQuestionId, "q2");
});

test("sanitizeAnalysis filtrerar commentFlags utanför intervallet och dubbletter", () => {
  const dirty: CommentAnalysis = {
    ...baseAnalysis,
    commentFlags: [
      { commentIndex: 0, reason: "utanför (för lågt)" },
      { commentIndex: 2, reason: "ok" },
      { commentIndex: 2, reason: "dubblett" },
      { commentIndex: 2.5, reason: "inte heltal" },
      { commentIndex: 4, reason: "utanför (för högt)" },
    ],
  };
  const clean = sanitizeAnalysis(dirty, new Set(["q1"]), 3);
  assert.deepEqual(clean.commentFlags, [{ commentIndex: 2, reason: "ok" }]);
});

test("isPresentable speglar flaggning", () => {
  assert.equal(isPresentable(baseAnalysis), true);
  assert.equal(isPresentable({ ...baseAnalysis, flagged: true, flagReason: "spam" }), false);
});
