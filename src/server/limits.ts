/**
 * Produktions-rate-limiting + global daglig budget-spärr för AI-anrop.
 *
 * På Vercel (serverless) delar inte instanser minne — använd Upstash Redis
 * (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Utan dessa faller vi
 * tillbaka på in-memory (ok i utveckling / single-instance). Den HÅRDA
 * kostnadsspärren är ändå spend limit i Anthropic Console.
 */

import { createHash } from "node:crypto";

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 20);
const DAILY_AI_CALL_BUDGET = Number(process.env.DAILY_AI_CALL_BUDGET ?? 500);
const DAILY_ADMIN_AI_CALL_BUDGET = Number(process.env.DAILY_ADMIN_AI_CALL_BUDGET ?? 100);

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }
    : null;

/** True i produktion (Vercel eller NODE_ENV=production). */
function isProd(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

// Varna bara en gång per process för respektive degraderat läge (undvik loggspam).
let warnedAiNoUpstash = false;
let warnedRequestNoUpstash = false;

/**
 * Hasha IP innan den används som nyckel (integritet: ingen rå IP i Redis/minne).
 * SHA-256 av (RATE_LIMIT_SALT + ip), hex-digest.
 */
function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "";
  return createHash("sha256").update(salt + ip).digest("hex");
}

/** Atomisk räknare med TTL i Upstash. Returnerar nytt värde. */
async function upstashIncr(key: string, ttlSeconds: number): Promise<number> {
  const res = await fetch(`${upstash!.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${upstash!.token}`, "content-type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(ttlSeconds)],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash-fel: ${res.status}`);
  const data = (await res.json()) as Array<{ result: number }>;
  return data[0]?.result ?? 0;
}

const memRate = new Map<string, { count: number; reset: number }>();
const memBudget = new Map<string, number>();

/** Per-IP rate limit (true = tillåten). IP hashas innan den blir nyckel. */
export async function allowRequest(ip: string, nowMs: number, limit: number = RATE_LIMIT_PER_MIN): Promise<boolean> {
  const id = hashIp(ip);
  if (upstash) {
    const window = Math.floor(nowMs / 60_000);
    try {
      const n = await upstashIncr(`rl:${id}:${window}`, 70);
      return n <= limit;
    } catch (err) {
      // Transient Upstash-blip ska aldrig 500:a anropet — fail-open (rate limit
      // är inte den hårda spärren). Logga felet.
      console.error("Upstash rate limit-fel (fail-open):", err);
      return true;
    }
  }
  // Ingen Upstash: i prod fail:ar vi INTE helt stängt — varna en gång och
  // fortsätt räkna in-memory (single-instance-skydd är bättre än inget).
  if (isProd() && !warnedRequestNoUpstash) {
    warnedRequestNoUpstash = true;
    console.warn("Rate limit körs in-memory utan Upstash i produktion (delas ej mellan instanser).");
  }
  const e = memRate.get(id);
  if (!e || nowMs >= e.reset) {
    memRate.set(id, { count: 1, reset: nowMs + 60_000 });
    return true;
  }
  if (e.count >= limit) return false;
  e.count += 1;
  return true;
}

/** Global daglig budget-spärr för AI-anrop (true = inom budget). */
export async function allowAiCall(nowIso: string, cap: number = DAILY_AI_CALL_BUDGET): Promise<boolean> {
  const day = nowIso.slice(0, 10);
  if (upstash) {
    try {
      const n = await upstashIncr(`aibudget:${day}`, 90_000);
      return n <= cap;
    } catch (err) {
      // Fail-open vid transient Upstash-fel — Anthropic Console spend limit är
      // den hårda kostnadsspärren, så en blip ska inte 500:a analyze.
      console.error("Upstash AI-budget-fel (fail-open):", err);
      return true;
    }
  }
  // Ingen Upstash: i prod KAN vi inte räkna budgeten globalt → neka AI (rutten
  // degraderar utan AI-analys) och varna en gång. Behåll in-memory i dev.
  if (isProd()) {
    if (!warnedAiNoUpstash) {
      warnedAiNoUpstash = true;
      console.warn("AI-budget kan inte hävdas utan Upstash i produktion – nekar AI-anrop (fail-closed).");
    }
    return false;
  }
  const n = (memBudget.get(day) ?? 0) + 1;
  memBudget.set(day, n);
  return n <= cap;
}

/** Separat daglig budget-spärr för admin-AI-anrop (true = inom budget). */
export async function allowAdminAiCall(nowIso: string, cap: number = DAILY_ADMIN_AI_CALL_BUDGET): Promise<boolean> {
  const day = nowIso.slice(0, 10);
  if (upstash) {
    try {
      const n = await upstashIncr(`aibudget:admin:${day}`, 90_000);
      return n <= cap;
    } catch (err) {
      // Fail-open vid transient Upstash-fel — spend limit är hårda spärren.
      console.error("Upstash admin-AI-budget-fel (fail-open):", err);
      return true;
    }
  }
  // Ingen Upstash i prod: neka admin-AI (fail-closed), varna en gång.
  if (isProd()) {
    if (!warnedAiNoUpstash) {
      warnedAiNoUpstash = true;
      console.warn("AI-budget kan inte hävdas utan Upstash i produktion – nekar AI-anrop (fail-closed).");
    }
    return false;
  }
  const n = (memBudget.get(`admin:${day}`) ?? 0) + 1;
  memBudget.set(`admin:${day}`, n);
  return n <= cap;
}
