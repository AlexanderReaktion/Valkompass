import { test } from "node:test";
import assert from "node:assert/strict";

import { allowRequest, allowAiCall, allowAdminAiCall } from "./limits.ts";

// Utan UPSTASH_*-env körs in-memory-grenen. Testerna nedan rör inte nätverket.

test("allowRequest tillåter upp till gränsen per IP/minut", async () => {
  const ip = "ip-a";
  assert.equal(await allowRequest(ip, 0, 2), true);
  assert.equal(await allowRequest(ip, 10, 2), true);
  assert.equal(await allowRequest(ip, 20, 2), false);
  // nytt fönster
  assert.equal(await allowRequest(ip, 60_001, 2), true);
});

test("allowRequest separerar olika IP:er (hashas till olika nycklar)", async () => {
  // Två olika IP:er ska ha oberoende räknare även efter hashning.
  assert.equal(await allowRequest("ip-b", 0, 1), true);
  assert.equal(await allowRequest("ip-b", 5, 1), false);
  assert.equal(await allowRequest("ip-c", 5, 1), true);
});

test("allowAiCall håller daglig budget", async () => {
  const day = "2026-09-01T08:00:00.000Z";
  assert.equal(await allowAiCall(day, 2), true);
  assert.equal(await allowAiCall(day, 2), true);
  assert.equal(await allowAiCall(day, 2), false);
  // ny dag nollställer
  assert.equal(await allowAiCall("2026-09-02T00:00:00.000Z", 2), true);
});

test("allowAdminAiCall håller separat daglig admin-budget", async () => {
  const day = "2026-10-01T08:00:00.000Z";
  assert.equal(await allowAdminAiCall(day, 2), true);
  assert.equal(await allowAdminAiCall(day, 2), true);
  assert.equal(await allowAdminAiCall(day, 2), false);
  // ny dag nollställer
  assert.equal(await allowAdminAiCall("2026-10-02T00:00:00.000Z", 2), true);
});

test("admin- och publik AI-budget delar inte räknare (separata nycklar)", async () => {
  const day = "2026-11-01T08:00:00.000Z";
  // Töm publika budgeten — admin ska vara opåverkad.
  assert.equal(await allowAiCall(day, 1), true);
  assert.equal(await allowAiCall(day, 1), false);
  assert.equal(await allowAdminAiCall(day, 1), true);
});

test("allowAiCall fail-closed i produktion utan Upstash", async () => {
  const prev = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    // Ingen Upstash + prod → neka AI oavsett budget.
    assert.equal(await allowAiCall("2026-12-01T08:00:00.000Z", 1000), false);
    assert.equal(await allowAdminAiCall("2026-12-01T08:00:00.000Z", 1000), false);
  } finally {
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  }
});

test("allowRequest fail:ar INTE helt stängt i produktion utan Upstash (in-memory)", async () => {
  const prev = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    // I prod utan Upstash ska den fortsätta räkna in-memory, inte neka allt.
    assert.equal(await allowRequest("ip-prod", 0, 2), true);
    assert.equal(await allowRequest("ip-prod", 5, 2), true);
    assert.equal(await allowRequest("ip-prod", 10, 2), false);
  } finally {
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  }
});
