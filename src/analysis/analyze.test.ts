import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeComment, isPresentable } from "./analyze.ts";
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
  flagged: false,
  flagReason: "",
};

// Fake-analyzer som fångar input för verifiering.
function capturingAnalyzer(out: CommentAnalysis): { analyzer: CommentAnalyzer; last: () => AnalyzeInput | null } {
  let captured: AnalyzeInput | null = null;
  return {
    analyzer: {
      async analyze(input) {
        captured = input;
        return out;
      },
    },
    last: () => captured,
  };
}

test("tom kommentar kastar fel", async () => {
  const { analyzer } = capturingAnalyzer(baseAnalysis);
  await assert.rejects(
    () => analyzeComment({ comment: "   ", ranking, questions: [], analyzer }),
    /Tom kommentar/,
  );
});

test("assemblerar topp-3 matchningar och trimmar kommentaren", async () => {
  const { analyzer, last } = capturingAnalyzer(baseAnalysis);
  await analyzeComment({
    comment: "  jag bryr mig om skatter  ",
    questionId: "q1",
    ranking,
    questions: [{ id: "q1", text: "Skatt?" }],
    analyzer,
  });
  const input = last()!;
  assert.equal(input.comment, "jag bryr mig om skatter");
  assert.equal(input.questionId, "q1");
  assert.equal(input.topMatches.length, 3);
  assert.deepEqual(input.topMatches.map((m) => m.partyId), ["M", "L", "KD"]);
});

test("isPresentable speglar flaggning", () => {
  assert.equal(isPresentable(baseAnalysis), true);
  assert.equal(isPresentable({ ...baseAnalysis, flagged: true, flagReason: "spam" }), false);
});
