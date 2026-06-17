/**
 * Produktions-rate-limiting + global daglig budget-spärr för AI-anrop.
 *
 * På Vercel (serverless) delar inte instanser minne — använd Upstash Redis
 * (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Utan dessa faller vi
 * tillbaka på in-memory (ok i utveckling / single-instance). Den HÅRDA
 * kostnadsspärren är ändå spend limit i Anthropic Console.
 */

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 20);
const DAILY_AI_CALL_BUDGET = Number(process.env.DAILY_AI_CALL_BUDGET ?? 500);

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }
    : null;

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

/** Per-IP rate limit (true = tillåten). */
export async function allowRequest(ip: string, nowMs: number, limit: number = RATE_LIMIT_PER_MIN): Promise<boolean> {
  if (upstash) {
    const window = Math.floor(nowMs / 60_000);
    const n = await upstashIncr(`rl:${ip}:${window}`, 70);
    return n <= limit;
  }
  const e = memRate.get(ip);
  if (!e || nowMs >= e.reset) {
    memRate.set(ip, { count: 1, reset: nowMs + 60_000 });
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
    const n = await upstashIncr(`aibudget:${day}`, 90_000);
    return n <= cap;
  }
  const n = (memBudget.get(day) ?? 0) + 1;
  memBudget.set(day, n);
  return n <= cap;
}
