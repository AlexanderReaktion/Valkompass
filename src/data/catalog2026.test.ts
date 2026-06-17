import { test } from "node:test";
import assert from "node:assert/strict";

import { catalog2026Positions, catalog2026Questions } from "./catalog2026.ts";
import { approvePosition, approveQuestion, validateForPublish } from "../catalog/catalog.ts";
import type { Scale } from "../matching/types.ts";

const scale: Scale = { min: -2, max: 2 };
const PARTIES = ["V", "S", "MP", "C", "L", "KD", "M", "SD"];
const now = "2026-06-17T00:00:00.000Z";

test("2026: 45 frågor, alla utkast, båda dimensionerna, blandad polaritet", () => {
  assert.equal(catalog2026Questions.length, 45);
  assert.ok(catalog2026Questions.every((q) => q.status === "draft"));
  const dims = new Set(catalog2026Questions.map((q) => q.dimension).filter(Boolean));
  assert.ok(dims.has("economic") && dims.has("galtan"));
  const pols = new Set(catalog2026Questions.map((q) => q.polarity));
  assert.ok(pols.has(1) && pols.has(-1));
});

test("2026: 360 positioner, värden i skala, källbelagda, alla par täckta", () => {
  assert.equal(catalog2026Positions.length, 45 * 8);
  const seen = new Set<string>();
  for (const p of catalog2026Positions) {
    assert.ok(p.value >= -2 && p.value <= 2, `${p.questionId}/${p.partyId} utanför skala`);
    assert.ok(p.citations.length >= 1 && p.citations[0]!.url.startsWith("http"), `${p.questionId}/${p.partyId} saknar källa`);
    seen.add(`${p.questionId}::${p.partyId}`);
  }
  for (const q of catalog2026Questions) {
    for (const party of PARTIES) {
      assert.ok(seen.has(`${q.id}::${party}`), `saknar position ${q.id}/${party}`);
    }
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
