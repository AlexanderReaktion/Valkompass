import { test } from "node:test";
import assert from "node:assert/strict";

import { fixedWindowLimiter } from "./ratelimit.ts";

test("tillåter upp till gränsen och blockerar sedan", () => {
  const rl = fixedWindowLimiter(3, 1000);
  assert.equal(rl.check("ip", 0), true);
  assert.equal(rl.check("ip", 100), true);
  assert.equal(rl.check("ip", 200), true);
  assert.equal(rl.check("ip", 300), false);
});

test("nollställs efter fönstret", () => {
  const rl = fixedWindowLimiter(1, 1000);
  assert.equal(rl.check("ip", 0), true);
  assert.equal(rl.check("ip", 500), false);
  assert.equal(rl.check("ip", 1000), true);
});

test("nycklar räknas oberoende", () => {
  const rl = fixedWindowLimiter(1, 1000);
  assert.equal(rl.check("a", 0), true);
  assert.equal(rl.check("b", 0), true);
  assert.equal(rl.check("a", 0), false);
});
