import { test } from "node:test";
import assert from "node:assert/strict";

import { catalog2026Questions } from "../data/catalog2026.ts";
import { buildTestPlan, equivalenceKey, uniqueGroupQuestions } from "./testPlan.ts";

test("standardplan väljer 35 balanserade frågor ur banken", () => {
  const plan = buildTestPlan(catalog2026Questions, "seed-a", "standard");
  assert.equal(plan.selectedQuestions.length, 35);
  assert.ok(plan.sections.length >= 5);
  assert.equal(plan.totalFormulations, 62);
  assert.equal(plan.totalQuestionGroups, 47);
});

test("djupplan använder alla sakfrågegrupper men inte alternativa dubbletter", () => {
  const plan = buildTestPlan(catalog2026Questions, "seed-a", "deep");
  const groups = plan.selectedQuestions.map((q) => equivalenceKey(q.id));
  assert.equal(plan.selectedQuestions.length, 47);
  assert.equal(new Set(groups).size, groups.length);
});

test("uniqueGroupQuestions behåller exakt en formulering per sakfrågegrupp", () => {
  const unique = uniqueGroupQuestions(catalog2026Questions);
  assert.equal(unique.length, 47);
  assert.equal(new Set(unique.map((q) => equivalenceKey(q.id))).size, unique.length);
});

test("olika seeds kan välja olika formuleringar för samma sakfrågegrupp", () => {
  const a = buildTestPlan(catalog2026Questions, "seed-a", "deep").selectedQuestions.map((q) => q.id);
  const b = buildTestPlan(catalog2026Questions, "seed-b", "deep").selectedQuestions.map((q) => q.id);
  assert.notDeepEqual(a, b);
});
