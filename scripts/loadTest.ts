/**
 * Lasttest av matchnings-API:t (POST /api/analyze utan kommentarer: full
 * validering + matchning + koordinater, inga AI-anrop och ingen lagring).
 *
 * Kör mot en LOKAL produktionsbuild (uppmätta tal är en konservativ nedre
 * gräns för Vercel, som dessutom skalar horisontellt per instans):
 *   npm run build
 *   set "ALLOW_DRAFT_CATALOG=true" && set "CRON_SECRET=lasttest" && set "RATE_LIMIT_PER_MIN=1000000" && npx next start -p 3100
 *   npm run loadtest
 *
 * Miljö: LOADTEST_BASE_URL (default http://localhost:3100),
 * LOADTEST_CONCURRENCY (default 25), LOADTEST_DURATION_MS (default 12000).
 *
 * Obs: rate-limitern testas separat i enhetstester (ratelimit.test.ts,
 * limits.test.ts) och körs i produktion via Upstash; här höjs gränsen så att
 * själva beräkningsvägen mäts.
 */

import { catalog2026Questions } from "../src/data/catalog2026.ts";
import { uniqueGroupQuestions } from "../src/kompass/testPlan.ts";

const BASE = process.env.LOADTEST_BASE_URL ?? "http://localhost:3100";
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY ?? 25);
const DURATION_MS = Number(process.env.LOADTEST_DURATION_MS ?? 12_000);

// Realistisk standardkörning: 35 besvarade frågor med blandade värden.
const groups = uniqueGroupQuestions(catalog2026Questions).slice(0, 35);
const pattern = [2, -1, 1, 2, 0, -2, 1, 2, -1];
const answers = Object.fromEntries(
  groups.map((q, i) => [q.id, { value: pattern[i % pattern.length]!, weight: i % 5 === 0 ? 2 : 1 }]),
);
const payload = JSON.stringify({
  sessionId: "12345678-1234-4123-8123-123456789abc",
  method: "hybrid",
  answers,
});

const latencies: number[] = [];
const statuses = new Map<number, number>();
let networkErrors = 0;

async function worker(deadline: number): Promise<void> {
  while (performance.now() < deadline) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASE}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      await res.arrayBuffer(); // läs klart svaret så mätningen omfattar hela responsen
      latencies.push(performance.now() - t0);
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    } catch {
      networkErrors += 1;
    }
  }
}

function percentile(sorted: readonly number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

// Uppvärmning: en request så att JIT/route-kompilering inte räknas in.
const warm = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: payload,
}).catch(() => null);
if (!warm || !warm.ok) {
  console.error(
    `Servern på ${BASE} svarar inte som väntat (status ${warm?.status ?? "nätverksfel"}). Startade du next start enligt filhuvudet?`,
  );
  process.exit(1);
}
await warm.arrayBuffer();

console.log(`Lasttest: ${BASE} · ${CONCURRENCY} samtidiga · ${DURATION_MS / 1000} s · payload ${answers && Object.keys(answers).length} svar`);
const start = performance.now();
const deadline = start + DURATION_MS;
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(deadline)));
const elapsedS = (performance.now() - start) / 1000;

const sorted = [...latencies].sort((a, b) => a - b);
const ok = statuses.get(200) ?? 0;
console.log(`\nTotalt: ${latencies.length} svar på ${elapsedS.toFixed(1)} s → ${(latencies.length / elapsedS).toFixed(0)} req/s`);
console.log(`Status: ${[...statuses.entries()].map(([code, n]) => `${code}×${n}`).join(" · ")}${networkErrors > 0 ? ` · nätverksfel×${networkErrors}` : ""}`);
if (sorted.length > 0) {
  console.log(
    `Latens (ms): p50 ${percentile(sorted, 50).toFixed(0)} · p90 ${percentile(sorted, 90).toFixed(0)} · p95 ${percentile(sorted, 95).toFixed(0)} · p99 ${percentile(sorted, 99).toFixed(0)} · max ${sorted[sorted.length - 1]!.toFixed(0)}`,
  );
}
if (ok !== latencies.length) {
  console.log("VARNING: icke-200-svar förekom; granska statusfördelningen ovan.");
}
