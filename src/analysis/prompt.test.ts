import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAnalysisUserMessage } from "./prompt.ts";
import type { AnalyzeInput } from "./types.ts";

const baseInput: AnalyzeInput = {
  comments: [
    { questionId: "q1", questionText: "Skatten bör sänkas.", text: "viktigast av allt" },
    { text: "övergripande tanke" },
  ],
  answers: [
    { questionId: "q1", questionText: "Skatten bör sänkas.", stance: "instämmer helt", weight: 2, hasComment: true },
    { questionId: "q2", questionText: "Bidragen bör höjas.", stance: "vet ej", weight: 1, hasComment: false },
  ],
  topMatches: [
    { partyId: "M", partyName: "Moderaterna", percent: 90, economicPercent: 95, galtanPercent: 61 },
    { partyId: "L", partyName: "Liberalerna", percent: 80 },
  ],
  userCoordinates: { economic: 0.5, galtan: null },
  questions: [{ id: "q1", text: "Skatten bör sänkas." }],
};

test("kommentarsetiketten anger BÅDE fråge-id och frågetext", () => {
  const msg = buildAnalysisUserMessage(baseInput);
  assert.match(msg, /\[fråga q1: "Skatten bör sänkas\."\]/);
  assert.match(msg, /\[övergripande\]/);
  // Numrerad lista (1-baserad) som commentFlags.commentIndex refererar till.
  assert.match(msg, /1\. \[fråga q1/);
  assert.match(msg, /2\. \[övergripande\]/);
});

test("skalsvaren listas kompakt med id, text, hållning, vikt och kommentarsmarkering", () => {
  const msg = buildAnalysisUserMessage(baseInput);
  assert.match(msg, /- q1 "Skatten bör sänkas\.": instämmer helt, vikt 2, kommenterad/);
  assert.match(msg, /- q2 "Bidragen bör höjas\.": vet ej, vikt 1(?!, kommenterad)/);
});

test("toppmatchningar med per-dimension-procent och koordinater tas med", () => {
  const msg = buildAnalysisUserMessage(baseInput);
  assert.match(msg, /Moderaterna: 90% \(ekonomi 95%, GAL–TAN 61%\)/);
  assert.match(msg, /Liberalerna: 80%(?! \()/);
  assert.match(msg, /position per axel .*: ekonomi 0\.5, GAL–TAN –/);
});

test("utan svar/koordinater degraderar prompten snyggt", () => {
  const msg = buildAnalysisUserMessage({
    comments: [{ text: "bara en kommentar" }],
    answers: [],
    topMatches: [],
    questions: [],
  });
  assert.match(msg, /Väljarens skalsvar[^\n]*\n\(inga\)/);
  assert.match(msg, /toppmatchningar: \(inga\)/);
  assert.doesNotMatch(msg, /position per axel/);
});
