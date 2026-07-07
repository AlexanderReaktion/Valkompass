import { test } from "node:test";
import assert from "node:assert/strict";

import { catalog2026Questions } from "../data/catalog2026.ts";
import { buildTestPlan, equivalenceKey, uniqueGroupQuestions } from "./testPlan.ts";

test("standardplan väljer 35 balanserade frågor ur banken", () => {
  const plan = buildTestPlan(catalog2026Questions, "seed-a", "standard");
  assert.equal(plan.selectedQuestions.length, 35);
  assert.ok(plan.sections.length >= 5);
  assert.equal(plan.totalFormulations, 74);
  assert.equal(plan.totalQuestionGroups, 54);
});

test("djupplan använder alla sakfrågegrupper men inte alternativa dubbletter", () => {
  const plan = buildTestPlan(catalog2026Questions, "seed-a", "deep");
  const groups = plan.selectedQuestions.map((q) => equivalenceKey(q.id));
  assert.equal(plan.selectedQuestions.length, 54);
  assert.equal(new Set(groups).size, groups.length);
});

test("uniqueGroupQuestions behåller exakt en formulering per sakfrågegrupp", () => {
  const unique = uniqueGroupQuestions(catalog2026Questions);
  assert.equal(unique.length, 54);
  assert.equal(new Set(unique.map((q) => equivalenceKey(q.id))).size, unique.length);
});

test("olika seeds kan välja olika formuleringar för samma sakfrågegrupp", () => {
  const a = buildTestPlan(catalog2026Questions, "seed-a", "deep").selectedQuestions.map((q) => q.id);
  const b = buildTestPlan(catalog2026Questions, "seed-b", "deep").selectedQuestions.map((q) => q.id);
  assert.notDeepEqual(a, b);
});

test("stratifierat urval är deterministiskt för ett givet seed", () => {
  for (const mode of ["quick", "standard", "deep"] as const) {
    const a = buildTestPlan(catalog2026Questions, "seed-a", mode).selectedQuestions.map((q) => q.id);
    const b = buildTestPlan(catalog2026Questions, "seed-a", mode).selectedQuestions.map((q) => q.id);
    assert.deepEqual(a, b);
  }
});

test("stratifierat urval balanserar polaritet och sprider dimensioner i en blandad sektion", () => {
  // Snabbtestet drar en delmängd; utan stratifiering kan urvalet råka bli ensidigt.
  const plan = buildTestPlan(catalog2026Questions, "seed-a", "quick");
  const valfard = plan.sections.find((s) => s.title === "Välfärd, bostad & arbete");
  assert.ok(valfard, "Välfärd-sektionen ska ingå i snabbtestet");
  // Poolen är polaritetsskev (8/5) och blandar economic med frågor utan kartaxel.
  const pols = new Set(valfard!.questions.map((q) => q.polarity));
  assert.ok(pols.has(1) && pols.has(-1), "båda polariteterna ska dras när poolen har båda");
  if (valfard!.questions.length >= 3) {
    const dims = new Set(valfard!.questions.map((q) => q.dimension ?? "none"));
    assert.ok(dims.size > 1, "flera dimensioner ska dras när poolen blandar dem");
  }
});

test("equivalenceKey: inget bas-id slutar på _alt och varje _alt-id kollapsar till en existerande bas", () => {
  const ids = catalog2026Questions.map((q) => q.id);
  const idSet = new Set(ids);
  for (const id of ids) {
    const base = equivalenceKey(id);
    if (id === base) {
      // Basfråga: får inte råka sluta på _alt (skulle krocka med strippningen).
      assert.ok(!/_alt\d*$/.test(id), `bas-id ${id} slutar på _alt`);
    } else {
      // Variant: basen den kollapsar till måste finnas och får inte själv sluta på _alt.
      assert.ok(idSet.has(base), `variant ${id} saknar basfråga ${base}`);
      assert.ok(!/_alt\d*$/.test(base), `basen ${base} för ${id} slutar själv på _alt`);
    }
  }
});
