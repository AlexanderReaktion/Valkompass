/**
 * Deterministisk matchningsmotor för valkompassen.
 *
 * Designprinciper (grundade i VAA-forskning):
 *  - Ren, deterministisk kod — INGEN LLM. Samma input ger alltid samma siffra.
 *  - Normerade avstånd → robust mot antal besvarade frågor, redovisas som %.
 *  - "Vet ej"/obesvarat exkluderas PARVIS (tolkas aldrig som mitten).
 *  - Flera metoder exponeras (känsligheten blir en transparensfunktion, inte en dold svaghet).
 *  - Per-fråga-breakdown så användaren kan se sitt avstånd mot varje parti.
 *  - Osäkerhet synliggörs (gap mellan topp-partier).
 */

import type {
  Coordinates,
  Dimension,
  MatchMethod,
  Party,
  PartyMatch,
  Question,
  QuestionBreakdown,
  RankedResult,
  Scale,
  UserAnswers,
} from "./types.ts";

// ---------- skalhjälpare ----------

function assertValidScale(scale: Scale): void {
  if (!(scale.max > scale.min)) {
    throw new Error(`Ogiltig skala: max (${scale.max}) måste vara > min (${scale.min}).`);
  }
}

const range = (scale: Scale): number => scale.max - scale.min;
const midpoint = (scale: Scale): number => (scale.max + scale.min) / 2;
const clamp = (value: number, scale: Scale): number =>
  Math.min(scale.max, Math.max(scale.min, value));

const round = (value: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

// ---------- intern beräkning ----------

interface Contribution {
  questionId: string;
  user: number; // klampad
  party: number; // klampad
  weight: number;
}

function collectContributions(
  party: Party,
  questions: readonly Question[],
  answers: UserAnswers,
  scale: Scale,
): Contribution[] {
  const out: Contribution[] = [];
  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer || answer.value === null) continue; // vet ej / obesvarad → parvis exkludering
    if (!Number.isFinite(answer.value)) continue; // NaN/Infinity → skydda mot ogiltigt svar
    const partyValue = party.positions[q.id];
    if (partyValue === undefined) continue; // partiet saknar position på frågan
    const weight = answer.weight ?? 1;
    if (!(weight > 0)) continue; // exkludera vikt 0, negativ ELLER NaN (vänd villkor för NaN-skydd)
    out.push({
      questionId: q.id,
      user: clamp(answer.value, scale),
      party: clamp(partyValue, scale),
      weight,
    });
  }
  return out;
}

/** Aggregerad likhet i [0,1] för en metod, viktad och normerad. */
function similarity(method: MatchMethod, contribs: Contribution[], scale: Scale): number {
  const r = range(scale);
  const totalW = contribs.reduce((s, c) => s + c.weight, 0);
  if (totalW === 0) return 0;

  const cityblock = (): number => {
    const wMeanAbs = contribs.reduce((s, c) => s + c.weight * Math.abs(c.user - c.party), 0) / totalW;
    return 1 - wMeanAbs / r;
  };

  const euclidean = (): number => {
    const wMeanSq = contribs.reduce((s, c) => s + c.weight * (c.user - c.party) ** 2, 0) / totalW;
    return 1 - Math.sqrt(wMeanSq) / r;
  };

  const directional = (): number => {
    // Riktad likhet i [0,1]: monoton i avståndet OCH självmatch == 1 för VARJE punkt på skalan
    // (inte bara vid ytterlägena). Grund: sim = 1 - |u-p|/range. Extra straff när väljare och
    // parti ligger på OLIKA sidor om mitten (sign(u) != sign(p)) — oenighet tvärs över centrum
    // bestraffas hårdare än rent avstånd. En centrist (u=0) får därmed också särskiljande kraft.
    const mid = midpoint(scale);
    const half = r / 2;
    const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
    const wMeanDir =
      contribs.reduce((s, c) => {
        const u = c.user - mid;
        const p = c.party - mid;
        const base = 1 - Math.abs(c.user - c.party) / r; // [0, 1], monoton avtagande i avstånd
        // Straffa endast när BÅDA ligger på var sin sida om mitten (ingen av dem i mitten).
        const opposite = sign(u) !== 0 && sign(p) !== 0 && sign(u) !== sign(p);
        const penalty = opposite ? Math.min(Math.abs(u), Math.abs(p)) / half : 0;
        const sim = Math.max(0, Math.min(1, base - penalty));
        return s + c.weight * sim;
      }, 0) / totalW;
    return wMeanDir;
  };

  switch (method) {
    case "cityblock":
      return cityblock();
    case "euclidean":
      return euclidean();
    case "directional":
      return directional();
    case "hybrid":
      // Mendez-hybrid: medelvärde av city-block och directional.
      return (cityblock() + directional()) / 2;
  }
}

// ---------- publikt API ----------

/**
 * Matcha en användare mot ETT parti med vald metod.
 * percent = null när inga gemensamt besvarade frågor finns (otillräckligt underlag).
 */
export function matchParty(
  party: Party,
  questions: readonly Question[],
  answers: UserAnswers,
  scale: Scale,
  method: MatchMethod = "hybrid",
): PartyMatch {
  assertValidScale(scale);
  const r = range(scale);
  const contribs = collectContributions(party, questions, answers, scale);

  const breakdown: QuestionBreakdown[] = contribs.map((c) => {
    const distance = Math.abs(c.user - c.party);
    return {
      questionId: c.questionId,
      userValue: c.user,
      partyValue: c.party,
      distance,
      agreement: round(1 - distance / r, 3),
      weight: c.weight,
    };
  });

  const percent =
    contribs.length === 0
      ? null
      : round(Math.min(100, Math.max(0, similarity(method, contribs, scale) * 100)), 1);

  return {
    partyId: party.id,
    partyName: party.name,
    method,
    percent,
    answeredCount: contribs.length,
    breakdown,
  };
}

export interface RankOptions {
  /** Procentenheters tröskel under vilken topp-2 anses "för jämnt". Default 3. */
  readonly closeThreshold?: number;
}

/** Matcha mot alla partier och rangordna, med osäkerhetsmått (gap mellan topp-2). */
export function rankParties(
  parties: readonly Party[],
  questions: readonly Question[],
  answers: UserAnswers,
  scale: Scale,
  method: MatchMethod = "hybrid",
  options: RankOptions = {},
): RankedResult {
  const closeThreshold = options.closeThreshold ?? 3;
  const matches = parties
    .map((p) => matchParty(p, questions, answers, scale, method))
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));

  const top = matches[0];
  const second = matches[1];
  const topGap =
    top?.percent != null && second?.percent != null
      ? round(top.percent - second.percent, 1)
      : null;

  return {
    method,
    matches,
    topGap,
    isClose: topGap != null && topGap <= closeThreshold,
  };
}

// ---------- 2D-karta ----------

/** Normera ett skalvärde till [-1, 1] (min → -1, mitt → 0, max → +1). */
function normalize(value: number, scale: Scale): number {
  const half = range(scale) / 2;
  return (clamp(value, scale) - midpoint(scale)) / half;
}

function dimensionAverage(
  samples: ReadonlyArray<{ value: number; weight: number }>,
  scale: Scale,
): number | null {
  const totalW = samples.reduce((s, x) => s + x.weight, 0);
  if (totalW === 0) return null;
  const wMean = samples.reduce((s, x) => s + x.weight * normalize(x.value, scale), 0) / totalW;
  return round(wMean, 3);
}

/** Användarens koordinater per strukturell axel (för 2D-kartan), normerade till [-1,1]. */
export function userCoordinates(
  questions: readonly Question[],
  answers: UserAnswers,
  scale: Scale,
): Coordinates {
  assertValidScale(scale);
  const byDim = new Map<Dimension, Array<{ value: number; weight: number }>>();
  for (const q of questions) {
    if (!q.dimension) continue;
    const answer = answers[q.id];
    if (!answer || answer.value === null) continue;
    const weight = answer.weight ?? 1;
    if (weight <= 0) continue;
    const arr = byDim.get(q.dimension) ?? [];
    arr.push({ value: answer.value, weight });
    byDim.set(q.dimension, arr);
  }
  const coords: Partial<Record<Dimension, number | null>> = {};
  for (const [dim, samples] of byDim) coords[dim] = dimensionAverage(samples, scale);
  return coords;
}

/** Ett partis koordinater per strukturell axel (för 2D-kartan), normerade till [-1,1]. */
export function partyCoordinates(
  party: Party,
  questions: readonly Question[],
  scale: Scale,
): Coordinates {
  assertValidScale(scale);
  const byDim = new Map<Dimension, Array<{ value: number; weight: number }>>();
  for (const q of questions) {
    if (!q.dimension) continue;
    const value = party.positions[q.id];
    if (value === undefined) continue;
    const arr = byDim.get(q.dimension) ?? [];
    arr.push({ value, weight: 1 });
    byDim.set(q.dimension, arr);
  }
  const coords: Partial<Record<Dimension, number | null>> = {};
  for (const [dim, samples] of byDim) coords[dim] = dimensionAverage(samples, scale);
  return coords;
}
