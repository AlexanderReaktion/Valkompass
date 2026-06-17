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

test("isPresentable speglar flaggning", () => {
  assert.equal(isPresentable(baseAnalysis), true);
  assert.equal(isPresentable({ ...baseAnalysis, flagged: true, flagReason: "spam" }), false);
});
