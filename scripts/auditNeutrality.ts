/**
 * Neutralitetsaudit: gynnar frågeuppsättningens geometri något parti?
 *
 * Metod: Monte Carlo med syntetiska respondenter som svarar SLUMPMÄSSIGT
 * (likformigt över skalans fem steg) på frågorna. Under en helt neutral
 * geometri vinner varje parti ~1/8 av slumpprofilerna. Systematisk avvikelse
 * betyder att positionsuppsättningen i sig drar åt ett håll (t.ex. att partier
 * nära skalmitten "vinner brus" i avståndsbaserade mått).
 *
 * Viktigt: detta mäter frågebankens och algoritmens STRUKTUR, aldrig verkliga
 * väljare (riktiga svar är inte likformiga). Det är en teknisk rättvisekontroll
 * som kompletterar, aldrig ersätter, en oberoende mänsklig granskning.
 *
 * Datakälla: den PUBLICERADE katalogen från driftmiljön om AUDIT_BASE_URL och
 * AUDIT_ADMIN_TOKEN är satta (läser /api/admin/catalog och filtrerar på status
 * approved); annars repo-katalogen som fallback.
 *
 * Kör: npm run audit:neutrality
 * Mot live: AUDIT_BASE_URL=https://... AUDIT_ADMIN_TOKEN=... npm run audit:neutrality
 */

import { catalog2026Positions, catalog2026Questions } from "../src/data/catalog2026.ts";
import { buildParties } from "../src/data/activeCatalog.ts";
import type { CatalogQuestion, PartyPosition } from "../src/catalog/types.ts";
import { uniqueGroupQuestions, seedFrom } from "../src/kompass/testPlan.ts";
import { rankParties } from "../src/matching/engine.ts";
import { toCanonicalAnswers } from "../src/matching/intake.ts";
import type { DisplayAnswers } from "../src/matching/intake.ts";
import type { MatchMethod, Question, Scale } from "../src/matching/types.ts";

const SCALE: Scale = { min: -2, max: 2 };
const STEPS = [-2, -1, 0, 1, 2] as const;
const N = 20_000;

// Deterministisk RNG (mulberry32, samma konstruktion som testPlan) så att
// auditen är reproducerbar och kan diffas mellan katalogversioner.
function rng(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface CatalogData {
  readonly questions: CatalogQuestion[];
  readonly positions: PartyPosition[];
  readonly source: string;
}

async function loadCatalog(): Promise<CatalogData> {
  const base = process.env.AUDIT_BASE_URL;
  const token = process.env.AUDIT_ADMIN_TOKEN;
  if (base && token) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/admin/catalog`, {
        headers: { "x-admin-token": token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { questions: CatalogQuestion[]; positions: PartyPosition[] };
      const questions = data.questions.filter((q) => q.status === "approved");
      const approvedIds = new Set(questions.map((q) => q.id));
      const positions = data.positions.filter((p) => p.status === "approved" && approvedIds.has(p.questionId));
      if (questions.length > 0) {
        return { questions, positions, source: `publicerad katalog från ${base} (${questions.length} godkända frågor)` };
      }
      console.warn("Live-katalogen saknar godkända frågor; faller tillbaka till repo-katalogen.");
    } catch (e) {
      console.warn(`Kunde inte läsa live-katalogen (${String(e)}); faller tillbaka till repo-katalogen.`);
    }
  }
  return {
    questions: [...catalog2026Questions],
    positions: [...catalog2026Positions],
    source: `repo-katalogen (${catalog2026Questions.length} formuleringar)`,
  };
}

const data = await loadCatalog();
// En formulering per sakfrågegrupp: varianter delar positioner, dubbletter
// skulle dubbelvikta gruppen i slumpprofilerna.
const groups = uniqueGroupQuestions(data.questions);
const questions: Question[] = groups.map((q) => ({
  id: q.id,
  polarity: q.polarity,
  ...(q.dimension ? { dimension: q.dimension } : {}),
}));
const parties = buildParties(data.positions).filter((p) => Object.keys(p.positions).length > 0);

console.log(`Neutralitetsaudit: ${data.source}`);
console.log(`Underlag: ${groups.length} sakfrågegrupper · ${parties.length} partier · ${N.toLocaleString("sv-SE")} slumpprofiler per villkor · likformig share = ${(100 / parties.length).toFixed(1)} %`);

interface Condition {
  readonly name: string;
  readonly answerRate: number;
  readonly method: MatchMethod;
}

const CONDITIONS: Condition[] = [
  { name: "hybrid · alla frågor besvarade", answerRate: 1, method: "hybrid" },
  { name: "hybrid · 60 % svarsfrekvens", answerRate: 0.6, method: "hybrid" },
  { name: "city-block · alla frågor besvarade", answerRate: 1, method: "cityblock" },
];

for (const condition of CONDITIONS) {
  const random = rng(seedFrom(`neutralitet-2026:${condition.name}`));
  const wins = new Map<string, number>(parties.map((p) => [p.id, 0]));
  const percentSum = new Map<string, number>(parties.map((p) => [p.id, 0]));
  const percentN = new Map<string, number>(parties.map((p) => [p.id, 0]));

  for (let i = 0; i < N; i += 1) {
    const display: Record<string, { value: number | null }> = {};
    for (const q of questions) {
      if (condition.answerRate < 1 && random() > condition.answerRate) continue;
      display[q.id] = { value: STEPS[Math.floor(random() * STEPS.length)]! };
    }
    const canonical = toCanonicalAnswers(display as DisplayAnswers, questions, SCALE);
    const ranked = rankParties(parties, questions, canonical, SCALE, condition.method);
    const top = ranked.matches[0];
    if (top?.percent != null) wins.set(top.partyId, (wins.get(top.partyId) ?? 0) + 1);
    for (const m of ranked.matches) {
      if (m.percent === null) continue;
      percentSum.set(m.partyId, (percentSum.get(m.partyId) ?? 0) + m.percent);
      percentN.set(m.partyId, (percentN.get(m.partyId) ?? 0) + 1);
    }
  }

  console.log(`\n=== ${condition.name} ===`);
  console.log(`${"parti".padEnd(6)} ${"topp-1".padStart(8)} ${"medelmatch".padStart(11)}`);
  const rows = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  let maxDev = 0;
  for (const [partyId, count] of rows) {
    const share = (100 * count) / N;
    maxDev = Math.max(maxDev, Math.abs(share - 100 / parties.length));
    const meanPct = (percentSum.get(partyId) ?? 0) / Math.max(1, percentN.get(partyId) ?? 0);
    console.log(`${partyId.padEnd(6)} ${`${share.toFixed(1)} %`.padStart(8)} ${`${meanPct.toFixed(1)} %`.padStart(11)}`);
  }
  console.log(`Största avvikelse från likformig topp-1-share: ${maxDev.toFixed(1)} procentenheter.`);
}

console.log(
  "\nTolkning: avvikelser här speglar positionsgeometrin (partier nära mitten och med bred täckning\n" +
    "vinner mer brus). Måttlig skevhet är väntad och ofarlig så länge den förklaras av partiernas\n" +
    "faktiska positioner; en STOR skevhet (en share flera gånger över likformig) motiverar granskning\n" +
    "av frågeurvalet. Auditen ersätter aldrig en oberoende mänsklig neutralitetsgranskning.",
);
