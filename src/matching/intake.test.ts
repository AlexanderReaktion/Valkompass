import { test } from "node:test";
import assert from "node:assert/strict";

import { toCanonicalValue, toCanonicalAnswers } from "./intake.ts";
import type { DisplayAnswers } from "./intake.ts";
import { matchParty } from "./engine.ts";
import type { Party, Question, Scale } from "./types.ts";

const scale: Scale = { min: -2, max: 2 };

test("polaritet 1 lämnar värdet oförändrat", () => {
  assert.equal(toCanonicalValue(2, 1, scale), 2);
  assert.equal(toCanonicalValue(-1, 1, scale), -1);
});

test("polaritet -1 speglar kring mitten", () => {
  assert.equal(toCanonicalValue(2, -1, scale), -2);
  assert.equal(toCanonicalValue(-1, -1, scale), 1);
  assert.equal(toCanonicalValue(0, -1, scale), 0);
});

test("spegling fungerar för asymmetrisk skala (0..10, mitt 5)", () => {
  const s: Scale = { min: 0, max: 10 };
  assert.equal(toCanonicalValue(8, -1, s), 2);
  assert.equal(toCanonicalValue(5, -1, s), 5);
});

test("toCanonicalAnswers konverterar per fråga och bevarar null + vikt", () => {
  const questions: Question[] = [
    { id: "q1", polarity: 1 },
    { id: "q2", polarity: -1 },
    { id: "q3" }, // default polaritet 1
  ];
  const display: DisplayAnswers = {
    q1: { value: 2 },
    q2: { value: 2, weight: 2 },
    q3: { value: null },
  };
  const canonical = toCanonicalAnswers(display, questions, scale);
  assert.deepEqual(canonical.q1, { value: 2 });
  assert.deepEqual(canonical.q2, { value: -2, weight: 2 }); // speglat, vikt bevarad
  assert.deepEqual(canonical.q3, { value: null });
});

test("okända fråge-id:n ignoreras tyst", () => {
  const canonical = toCanonicalAnswers({ qX: { value: 1 } }, [{ id: "q1" }], scale);
  assert.equal(Object.keys(canonical).length, 0);
});

test("end-to-end: omvänt formulerad fråga matchar rätt efter intag", () => {
  // q1 är omvänt formulerad (polarity -1). Partiet ligger kanoniskt på -2.
  const questions: Question[] = [{ id: "q1", dimension: "economic", polarity: -1 }];
  const party: Party = { id: "P", name: "P", positions: { q1: -2 } };
  // Användaren instämmer helt (+2) i det omvänt formulerade påståendet → kanoniskt -2.
  const canonical = toCanonicalAnswers({ q1: { value: 2 } }, questions, scale);
  assert.equal(matchParty(party, questions, canonical, scale, "cityblock").percent, 100);
});
