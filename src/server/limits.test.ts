import { test } from "node:test";
import assert from "node:assert/strict";

import { allowRequest, allowAiCall } from "./limits.ts";

// Utan UPSTASH_*-env körs in-memory-grenen.

test("allowRequest tillåter upp till gränsen per IP/minut", async () => {
  const ip = "ip-a";
  assert.equal(await allowRequest(ip, 0, 2), true);
  assert.equal(await allowRequest(ip, 10, 2), true);
  assert.equal(await allowRequest(ip, 20, 2), false);
  // nytt fönster
  assert.equal(await allowRequest(ip, 60_001, 2), true);
});

test("allowAiCall håller daglig budget", async () => {
  const day = "2026-09-01T08:00:00.000Z";
  assert.equal(await allowAiCall(day, 2), true);
  assert.equal(await allowAiCall(day, 2), true);
  assert.equal(await allowAiCall(day, 2), false);
  // ny dag nollställer
  assert.equal(await allowAiCall("2026-09-02T00:00:00.000Z", 2), true);
});
