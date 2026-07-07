import type { CatalogQuestion } from "../catalog/types.ts";

export type TestModeId = "quick" | "standard" | "deep";

export interface TestMode {
  readonly id: TestModeId;
  readonly label: string;
  readonly description: string;
  /** Max antal sakfrågegrupper. Infinity = alla grupper. */
  readonly targetGroups: number;
}

export interface QuestionSection {
  readonly title: string;
  readonly questions: readonly CatalogQuestion[];
}

export interface TestPlan {
  readonly mode: TestMode;
  readonly sections: readonly QuestionSection[];
  readonly selectedQuestions: readonly CatalogQuestion[];
  readonly totalQuestionGroups: number;
  readonly totalFormulations: number;
}

export const TEST_MODES: readonly TestMode[] = [
  { id: "quick", label: "Snabbtest", description: "25 frågor · ca 4 min · bred täckning.", targetGroups: 25 },
  { id: "standard", label: "Standard", description: "35 frågor · ca 6 min · bättre stabilitet.", targetGroups: 35 },
  // Tidsuppskattningen följer bankens storlek: 54 grupper sedan 2026-07 (tidigare 47, "ca 8–10 min").
  { id: "deep", label: "Fördjupning", description: "Alla sakfrågegrupper · ca 9–11 min.", targetGroups: Number.POSITIVE_INFINITY },
] as const;

const SECTION_DEFS: { title: string; ids: string[]; topics: string[] }[] = [
  { title: "Skatter & ekonomi", ids: ["skatt_arbete", "hoginkomstskatt", "bolagsskatt", "kapitalskatt", "offentliga_utgifter", "rutrot", "bensinskatt"], topics: ["skatter", "företag", "ekonomi", "drivmedel"] },
  { title: "Välfärd, bostad & arbete", ids: ["vinst_valfard", "offentlig_ansvar", "arbetsratt", "akassa", "forsorjningsstod", "pension", "vard_resurser", "sjukvard_stat", "tandvard_hogkostnad", "friskolor", "vinst_skola", "skola_forstatliga", "marknadshyror"], topics: ["välfärd", "arbetsmarknad", "trygghet", "bidrag", "pension", "sjukvård", "skola", "bostad"] },
  { title: "Migration & integration", ids: ["arbetskraftsinvandring", "asyl_farre", "flykting_oppen", "medborgarskap", "medborgarskap_aterkallelse", "atervandring", "anhorig", "informationsplikt"], topics: ["migration", "integration"] },
  { title: "Lag & ordning", ids: ["straff", "polisbefogenheter", "visitationszoner", "ungdomsstraff", "forebyggande", "integritet", "narkotika_avkrim"], topics: ["brottslighet", "integritet"] },
  { title: "Klimat & energi", ids: ["klimat_prioritet", "karnkraft", "vindkraft", "miljoskatter", "reduktionsplikt", "naturskydd", "vargjakt", "strandskydd"], topics: ["klimat", "energi", "miljö"] },
  { title: "Familj, rättigheter & demokrati", ids: ["foraldraforsakring", "abort", "hbtqi", "public_service", "monarki"], topics: ["familj", "rättigheter", "media", "demokrati"] },
  // 2026-07: bistand flyttad hit från Migration & integration (biståndsramen är utrikes-/säkerhetspolitik).
  { title: "Försvar & EU", ids: ["nato", "forsvarsanslag", "eu_makt", "euro", "israel_sanktioner", "bistand"], topics: ["försvar", "EU", "utrikespolitik", "bistånd"] },
];

export function seedFrom(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function equivalenceKey(questionId: string): string {
  return questionId.replace(/_alt\d*$/, "");
}

/**
 * En fråga per sakfrågegrupp (variantformuleringar delar positionsvärden —
 * att räkna båda dubbelviktar gruppen). Används för stabila partikoordinater
 * på 2D-kartan: partierna ska ligga still oavsett vilken variant en körning drog.
 */
export function uniqueGroupQuestions(questions: readonly CatalogQuestion[]): CatalogQuestion[] {
  const seen = new Set<string>();
  const out: CatalogQuestion[] = [];
  for (const q of questions) {
    const key = equivalenceKey(q.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function modeById(id: TestModeId): TestMode {
  return TEST_MODES.find((m) => m.id === id) ?? TEST_MODES[1]!;
}

function sectionFor(q: CatalogQuestion): number {
  // Explicit id-placering vinner över ämnesmatchning i ALLA sektioner — annars
  // skuggar en tidigare sektions breda topics (t.ex. "arbetsmarknad", "drivmedel")
  // frågor som uttryckligen hör hemma senare (arbetskraftsinvandring → Migration,
  // reduktionsplikt → Klimat & energi).
  const key = equivalenceKey(q.id);
  for (let i = 0; i < SECTION_DEFS.length; i += 1) {
    if (SECTION_DEFS[i]!.ids.includes(key)) return i;
  }
  for (let i = 0; i < SECTION_DEFS.length; i += 1) {
    if (SECTION_DEFS[i]!.topics.includes(q.topic)) return i;
  }
  return SECTION_DEFS.length;
}

function groupedBySection(questions: readonly CatalogQuestion[], seed: number): Map<number, CatalogQuestion[]> {
  const groups = new Map<string, CatalogQuestion[]>();
  for (const q of questions) {
    const key = `${sectionFor(q)}::${equivalenceKey(q.id)}`;
    const arr = groups.get(key) ?? [];
    arr.push(q);
    groups.set(key, arr);
  }

  const bySection = new Map<number, CatalogQuestion[]>();
  let i = 0;
  for (const [key, qs] of groups) {
    const section = Number(key.split("::", 1)[0]);
    const chosen = shuffle(qs, seed + i + 1)[0]!;
    const arr = bySection.get(section) ?? [];
    arr.push(chosen);
    bySection.set(section, arr);
    i += 1;
  }
  return bySection;
}

function quotas(counts: number[], target: number): number[] {
  const total = counts.reduce((s, n) => s + n, 0);
  if (!Number.isFinite(target) || target >= total) return [...counts];
  const raw = counts.map((n) => (n / total) * target);
  const out = raw.map((n, i) => (counts[i]! > 0 ? Math.max(1, Math.floor(n)) : 0));
  while (out.reduce((s, n) => s + n, 0) > target) {
    let index = -1;
    let smallestFraction = Number.POSITIVE_INFINITY;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i]! <= 1) continue;
      const fraction = raw[i]! - Math.floor(raw[i]!);
      if (fraction < smallestFraction) {
        smallestFraction = fraction;
        index = i;
      }
    }
    if (index < 0) break;
    out[index] -= 1;
  }
  while (out.reduce((s, n) => s + n, 0) < target) {
    let index = -1;
    let bestNeed = -1;
    for (let i = 0; i < counts.length; i += 1) {
      const need = counts[i]! - out[i]!;
      if (need > bestNeed) {
        bestNeed = need;
        index = i;
      }
    }
    if (index < 0 || bestNeed <= 0) break;
    out[index] += 1;
  }
  return out;
}

export function buildTestPlan(
  questions: readonly CatalogQuestion[],
  seed: string,
  modeId: TestModeId = "standard",
): TestPlan {
  const mode = modeById(modeId);
  const baseSeed = seedFrom(`${seed}:${mode.id}`);
  const bySection = groupedBySection(questions, baseSeed);
  const sectionCount = SECTION_DEFS.length + 1;
  const counts = Array.from({ length: sectionCount }, (_, i) => bySection.get(i)?.length ?? 0);
  const totalQuestionGroups = counts.reduce((s, n) => s + n, 0);
  const sectionQuotas = quotas(counts, Math.min(mode.targetGroups, totalQuestionGroups));

  const sections: QuestionSection[] = [];
  for (let i = 0; i < sectionCount; i += 1) {
    const candidates = bySection.get(i) ?? [];
    const selected = shuffle(candidates, baseSeed + 100 + i).slice(0, sectionQuotas[i]);
    if (selected.length === 0) continue;
    sections.push({
      title: SECTION_DEFS[i]?.title ?? "Övrigt",
      questions: selected,
    });
  }

  const selectedQuestions = sections.flatMap((s) => [...s.questions]);
  return {
    mode,
    sections,
    selectedQuestions,
    totalQuestionGroups,
    totalFormulations: questions.length,
  };
}
