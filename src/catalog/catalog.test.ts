import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createQuestion,
  approveQuestion,
  archiveQuestion,
  approvePosition,
  lintQuestionText,
  validateForPublish,
  publishCatalog,
  toMatchingQuestions,
} from "./catalog.ts";
import type { CatalogQuestion, PartyPosition } from "./types.ts";
import { matchParty } from "../matching/engine.ts";
import type { Party, Scale } from "../matching/types.ts";

const now = "2026-06-15T10:00:00.000Z";
const scale: Scale = { min: -2, max: 2 };
const parties = [
  { id: "P1", name: "Parti 1" },
  { id: "P2", name: "Parti 2" },
];

interface QOpts {
  dimension?: CatalogQuestion["dimension"];
  polarity?: 1 | -1;
  text?: string;
  topic?: string;
  rationale?: string;
}

function mkApproved(id: string, o: QOpts = {}): CatalogQuestion {
  const input = {
    id,
    kind: "structural" as const,
    text: o.text ?? `Neutral fråga ${id}.`,
    topic: o.topic ?? "ekonomi",
    polarity: o.polarity ?? (1 as const),
    rationale: o.rationale ?? "Skiljer partierna åt.",
    ...(o.dimension ? { dimension: o.dimension } : {}),
  };
  return approveQuestion(createQuestion(input, now), "granskare", now);
}

function mkPos(questionId: string, partyId: string, value: number): PartyPosition {
  return approvePosition(
    { questionId, partyId, value, citations: [{ label: "Partiprogram" }], status: "draft" },
    "granskare",
    now,
  );
}

// ---------- skapa & livscykel ----------

test("createQuestion sätter draft-default, polaritet 1, tidsstämpel och tomma källor", () => {
  const q = createQuestion({ id: "q1", kind: "dynamic", text: "Text", topic: "vård" }, now);
  assert.equal(q.status, "draft");
  assert.equal(q.polarity, 1);
  assert.equal(q.createdAt, now);
  assert.deepEqual(q.sources, []);
});

test("createQuestion vägrar tom text", () => {
  assert.throws(() => createQuestion({ id: "q1", kind: "dynamic", text: "   ", topic: "x" }, now));
});

test("approveQuestion kräver motivering", () => {
  const draft = createQuestion({ id: "q1", kind: "structural", text: "Text", topic: "x" }, now);
  assert.throws(() => approveQuestion(draft, "g", now), /motivering/);
});

test("approveQuestion sätter status, godkännare och tidsstämpel", () => {
  const q = mkApproved("q1");
  assert.equal(q.status, "approved");
  assert.equal(q.approvedBy, "granskare");
  assert.equal(q.approvedAt, now);
});

test("approveQuestion vägrar arkiverad fråga", () => {
  const archived = archiveQuestion(mkApproved("q1"));
  assert.throws(() => approveQuestion(archived, "g", now));
});

test("approvePosition kräver minst ett belägg", () => {
  const bad: PartyPosition = { questionId: "q1", partyId: "P1", value: 1, citations: [], status: "draft" };
  assert.throws(() => approvePosition(bad, "g", now), /belägg/);
});

// ---------- partiledtråds-lint ----------

test("lintQuestionText flaggar slogans/värdeord och släpper igenom neutral text", () => {
  assert.deepEqual(
    lintQuestionText("Det är dags att ta krafttag mot brottsligheten.").sort(),
    ["dags att", "krafttag"].sort(),
  );
  assert.deepEqual(lintQuestionText("Minimistraffen för grova vapenbrott bör höjas."), []);
});

// ---------- validering ----------

test("validateForPublish: ren katalog passerar utan fel eller varningar", () => {
  const questions = [
    mkApproved("q1", { dimension: "economic", polarity: 1, text: "Skatten på arbete bör sänkas." }),
    mkApproved("q2", { dimension: "galtan", polarity: -1, text: "Sverige bör ta emot färre asylsökande." }),
  ];
  const positions = [
    mkPos("q1", "P1", 2),
    mkPos("q1", "P2", -2),
    mkPos("q2", "P1", 1),
    mkPos("q2", "P2", -1),
  ];
  const r = validateForPublish({ questions, parties, positions, scale, minQuestions: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test("validateForPublish: ogodkänd fråga ger fel", () => {
  const draft = createQuestion(
    { id: "q1", kind: "structural", text: "Text", topic: "x", rationale: "r", dimension: "economic" },
    now,
  );
  const r = validateForPublish({ questions: [draft], parties: [parties[0]!], positions: [mkPos("q1", "P1", 1)], scale, minQuestions: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("inte godkänd")));
});

test("validateForPublish: saknad partiposition ger fel", () => {
  const questions = [mkApproved("q1", { dimension: "economic" }), mkApproved("q2", { dimension: "galtan" })];
  const positions = [mkPos("q1", "P1", 1), mkPos("q1", "P2", 1), mkPos("q2", "P1", 1)]; // q2/P2 saknas
  const r = validateForPublish({ questions, parties, positions, scale, minQuestions: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("Position saknas: fråga q2, parti P2")));
});

test("validateForPublish: position utan belägg ger fel", () => {
  const questions = [mkApproved("q1", { dimension: "economic" })];
  const badPos: PartyPosition = { questionId: "q1", partyId: "P1", value: 1, citations: [], status: "approved" };
  const r = validateForPublish({ questions, parties: [parties[0]!], positions: [badPos], scale, minQuestions: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("saknar belägg")));
});

test("validateForPublish: enhetlig polaritet ger varning", () => {
  const questions = [
    mkApproved("q1", { dimension: "economic", polarity: 1 }),
    mkApproved("q2", { dimension: "galtan", polarity: 1 }),
  ];
  const positions = [mkPos("q1", "P1", 1), mkPos("q1", "P2", 1), mkPos("q2", "P1", 1), mkPos("q2", "P2", 1)];
  const r = validateForPublish({ questions, parties, positions, scale, minQuestions: 1 });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("samma polaritet")));
});

test("validateForPublish: bara en axel ger varning", () => {
  const questions = [
    mkApproved("q1", { dimension: "economic", polarity: 1 }),
    mkApproved("q2", { dimension: "economic", polarity: -1 }),
  ];
  const positions = [mkPos("q1", "P1", 1), mkPos("q1", "P2", 1), mkPos("q2", "P1", 1), mkPos("q2", "P2", 1)];
  const r = validateForPublish({ questions, parties, positions, scale, minQuestions: 1 });
  assert.ok(r.warnings.some((w) => w.includes("Båda axlarna")));
});

test("validateForPublish: partiledtråd i texten ger varning", () => {
  const questions = [mkApproved("q1", { dimension: "economic", text: "Det behövs krafttag mot brottsligheten." })];
  const positions = [mkPos("q1", "P1", 1), mkPos("q1", "P2", 1)];
  const r = validateForPublish({ questions, parties, positions, scale, minQuestions: 1 });
  assert.ok(r.warnings.some((w) => w.includes("partiledtråd")));
});

// ---------- publicering ----------

function happyCatalogInput() {
  const questions = [
    mkApproved("q1", { dimension: "economic", polarity: 1, text: "Skatten på arbete bör sänkas." }),
    mkApproved("q2", { dimension: "galtan", polarity: -1, text: "Sverige bör ta emot färre asylsökande." }),
  ];
  const positions = [
    mkPos("q1", "P1", 2),
    mkPos("q1", "P2", -2),
    mkPos("q2", "P1", 1),
    mkPos("q2", "P2", -1),
  ];
  return { questions, parties, positions, scale, minQuestions: 1, version: 1, election: "riksdagsval-2026" };
}

test("publishCatalog kastar fel vid ogiltig katalog", () => {
  const input = happyCatalogInput();
  const draftQuestions = [createQuestion({ id: "q1", kind: "structural", text: "T", topic: "x", rationale: "r" }, now)];
  assert.throws(() => publishCatalog({ ...input, questions: draftQuestions }, now), /Kan inte publicera/);
});

test("publishCatalog fryser en versionerad ögonblicksbild", () => {
  const cat = publishCatalog(happyCatalogInput(), now);
  assert.equal(cat.version, 1);
  assert.equal(cat.election, "riksdagsval-2026");
  assert.equal(cat.publishedAt, now);
  assert.equal(cat.questions.length, 2);
  assert.ok(Object.isFrozen(cat.questions));
});

test("toMatchingQuestions ger motorns frågeform", () => {
  const cat = publishCatalog(happyCatalogInput(), now);
  const mq = toMatchingQuestions(cat);
  assert.deepEqual(mq[0], { id: "q1", polarity: 1, dimension: "economic" });
  assert.deepEqual(mq[1], { id: "q2", polarity: -1, dimension: "galtan" });
});

test("publicerad katalog matar matchningsmotorn end-to-end", () => {
  const cat = publishCatalog(happyCatalogInput(), now);
  const mq = toMatchingQuestions(cat);
  const party: Party = { id: "P1", name: "Parti 1", positions: { q1: 2, q2: 1 } };
  const m = matchParty(party, mq, { q1: { value: 2 }, q2: { value: 1 } }, scale, "cityblock");
  assert.equal(m.percent, 100);
});
