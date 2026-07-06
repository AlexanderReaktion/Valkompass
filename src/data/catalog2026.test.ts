import { test } from "node:test";
import assert from "node:assert/strict";

import { catalog2026Positions, catalog2026Questions } from "./catalog2026.ts";
import { approvePosition, approveQuestion, validateForPublish } from "../catalog/catalog.ts";
import type { Scale } from "../matching/types.ts";

const scale: Scale = { min: -2, max: 2 };
const PARTIES = ["V", "S", "MP", "C", "L", "KD", "M", "SD"];
const now = "2026-06-17T00:00:00.000Z";

test("2026: 62 formuleringar, alla utkast, båda dimensionerna, blandad polaritet", () => {
  assert.equal(catalog2026Questions.length, 62);
  assert.ok(catalog2026Questions.every((q) => q.status === "draft"));
  const dims = new Set(catalog2026Questions.map((q) => q.dimension).filter(Boolean));
  assert.ok(dims.has("economic") && dims.has("galtan"));
  const pols = new Set(catalog2026Questions.map((q) => q.polarity));
  assert.ok(pols.has(1) && pols.has(-1));
});

test("2026: 496 positioner, värden i skala, källbelagda, alla par täckta", () => {
  assert.equal(catalog2026Positions.length, 62 * 8);
  const seen = new Set<string>();
  for (const p of catalog2026Positions) {
    assert.ok(p.value >= -2 && p.value <= 2, `${p.questionId}/${p.partyId} utanför skala`);
    const firstUrl = p.citations[0]?.url;
    assert.ok(p.citations.length >= 1 && typeof firstUrl === "string" && firstUrl.startsWith("http"), `${p.questionId}/${p.partyId} saknar källa`);
    seen.add(`${p.questionId}::${p.partyId}`);
  }
  for (const q of catalog2026Questions) {
    for (const party of PARTIES) {
      assert.ok(seen.has(`${q.id}::${party}`), `saknar position ${q.id}/${party}`);
    }
  }
});

test("2026: ideologiska ankarpartier hamnar på motsatta sidor av skalans mittpunkt", () => {
  // Kanonisk skala: 0 är mittpunkt, högre = höger/TAN/för.
  // Robusta, okontroversiella ankare som ska hålla i nuvarande data.
  // Syftet är att fånga grova globala teckeninversioner – INTE att granska
  // enstaka tveksamma celler (de hanteras separat med expertgransknings-TODO).
  const valueOf = (questionId: string, partyId: string): number => {
    const p = catalog2026Positions.find((x) => x.questionId === questionId && x.partyId === partyId);
    assert.ok(p, `saknar position ${questionId}/${partyId}`);
    return p!.value;
  };

  // [fråga, positivt ankare, negativt ankare]
  const anchors: ReadonlyArray<readonly [string, string, string]> = [
    ["asyl_farre", "SD", "V"], // restriktiv vs öppen migration
    ["karnkraft", "M", "V"], // för utbyggnad vs emot
    ["bistand", "SD", "V"], // minska bistånd vs värna
    ["skatt_arbete", "M", "MP"], // sänkt skatt på arbete (höger) vs vänster
    ["abort", "SD", "V"], // begränsa sena aborter vs värna aborträtten (regressionsvakt för 2026-07-kalibreringen)
    ["marknadshyror", "M", "V"], // fri hyressättning vs bruksvärdessystem
    ["sjukvard_stat", "KD", "C"], // förstatliga vården vs regionalt självstyre
  ];

  for (const [questionId, posParty, negParty] of anchors) {
    const pos = valueOf(questionId, posParty);
    const neg = valueOf(questionId, negParty);
    assert.ok(pos > 0, `${questionId}: ${posParty} förväntas > 0 men är ${pos}`);
    assert.ok(neg < 0, `${questionId}: ${negParty} förväntas < 0 men är ${neg}`);

    // Spridningen över alla partier ska vara icke-trivial.
    const values = PARTIES.map((party) => valueOf(questionId, party));
    const spread = Math.max(...values) - Math.min(...values);
    assert.ok(spread >= 2, `${questionId}: för liten spridning (${spread})`);
  }
});

test("2026: efter godkännande validerar katalogen för publicering utan fel", () => {
  const questions = catalog2026Questions.map((q) => approveQuestion(q, "granskare", now));
  const positions = catalog2026Positions.map((p) => approvePosition(p, "granskare", now));
  const r = validateForPublish({
    questions,
    parties: PARTIES.map((id) => ({ id, name: id })),
    positions,
    scale,
    minQuestions: 1,
  });
  assert.equal(r.ok, true, r.errors.slice(0, 8).join("; "));
});
