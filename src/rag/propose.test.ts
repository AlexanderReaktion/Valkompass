import { test } from "node:test";
import assert from "node:assert/strict";

import { LexicalRetriever } from "./retriever.ts";
import type { CorpusDoc } from "./retriever.ts";
import { proposeDraftPosition } from "./propose.ts";
import { approvePosition } from "../catalog/catalog.ts";
import type { PositionProposer, ProposePositionInput, ProposedPosition } from "../ai/types.ts";
import type { Scale } from "../matching/types.ts";

const scale: Scale = { min: -2, max: 2 };

const corpus: CorpusDoc[] = [
  { id: "m1", partyId: "M", text: "Moderaterna vill sänka skatten på arbete.", source: { label: "M-program s.4", url: "https://moderaterna.se" } },
];

// Fake-proposer: returnerar fast värde + citerar första kontexten.
const fakeProposer = (value: number, withCitation: boolean): PositionProposer => ({
  async propose(input: ProposePositionInput): Promise<ProposedPosition> {
    return {
      value,
      confidence: 0.8,
      citations: withCitation && input.context[0] ? [input.context[0].doc.source] : [],
      reasoning: "demo",
    };
  },
});

test("proposeDraftPosition ger ett källbelagt utkast", async () => {
  const retriever = new LexicalRetriever(corpus);
  const { position, proposal } = await proposeDraftPosition({
    questionId: "q1",
    questionText: "Skatten på arbete bör sänkas.",
    partyId: "M",
    partyName: "Moderaterna",
    scale,
    retriever,
    proposer: fakeProposer(2, true),
  });
  assert.equal(position.status, "draft");
  assert.equal(position.value, 2);
  assert.ok(position.citations.length >= 1);
  assert.equal(proposal.confidence, 0.8);
  // Utkastet kan godkännas av människa (citat finns).
  const approved = approvePosition(position, "granskare", "2026-06-20T00:00:00.000Z");
  assert.equal(approved.status, "approved");
});

test("clamping håller värdet inom skalan", async () => {
  const retriever = new LexicalRetriever(corpus);
  const { position } = await proposeDraftPosition({
    questionId: "q1",
    questionText: "Skatten på arbete bör sänkas.",
    partyId: "M",
    partyName: "Moderaterna",
    scale,
    retriever,
    proposer: fakeProposer(9, true),
  });
  assert.equal(position.value, 2);
});

test("faller tillbaka på hämtade källor om modellen inte citerar", async () => {
  const retriever = new LexicalRetriever(corpus);
  const { position } = await proposeDraftPosition({
    questionId: "q1",
    questionText: "Skatten på arbete bör sänkas.",
    partyId: "M",
    partyName: "Moderaterna",
    scale,
    retriever,
    proposer: fakeProposer(1, false),
  });
  assert.ok(position.citations.length >= 1);
});
