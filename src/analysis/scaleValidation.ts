/**
 * Psykometrisk validering av kompassens skalor (ekonomi, GAL-TAN).
 *
 * Samma matematik körs i två lägen:
 *  1. Före lansering: partiernas kanoniska positioner som datamatris
 *     (8 fall = partierna). Detta är en STRUKTURKONTROLL av positionskodningen:
 *     den fångar felriktade frågor och frågor som inte hör hemma på axeln.
 *  2. Efter lansering: användarnas kanoniska svar som datamatris
 *     (responses-storens canonicalAnswers). Först då blir alfa-nivåerna
 *     tolkbara som väljarreliabilitet i klassisk mening.
 *
 * Mått:
 *  - Cronbachs alfa: intern konsistens för skalan som helhet.
 *  - Item-rest-korrelation: Pearson-r mellan en fråga och summan av övriga.
 *    Negativ betyder att frågan drar åt motsatt håll (felkodad eller fel axel).
 *  - Loevingers H (polytom kovariansform, Mokken): cov(i,j)/covmax(i,j), där
 *    covmax fås ur rearrangement-olikheten (båda variablerna sorterade
 *    stigande ger största möjliga kovarians givet marginalerna).
 *    Tumregler: H >= 0.3 svag skala, >= 0.4 medel, >= 0.5 stark.
 */

// ---------- grundstatistik (populationsdefinitioner, n i nämnaren) ----------

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export function covariance(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i += 1) s += (xs[i]! - mx) * (ys[i]! - my);
  return s / xs.length;
}

export const variance = (xs: readonly number[]): number => covariance(xs, xs);

/** Pearson-korrelation; null när någon variabel saknar varians. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const vx = variance(xs);
  const vy = variance(ys);
  if (vx === 0 || vy === 0) return null;
  return covariance(xs, ys) / Math.sqrt(vx * vy);
}

/**
 * Största möjliga kovarians givet de två variablernas marginalfördelningar:
 * sortera båda stigande och para ihop (rearrangement-olikheten).
 */
export function covMax(xs: readonly number[], ys: readonly number[]): number {
  const sx = [...xs].sort((a, b) => a - b);
  const sy = [...ys].sort((a, b) => a - b);
  return covariance(sx, sy);
}

// ---------- skalmått ----------

/** Cronbachs alfa. null när färre än två frågor eller när totalsumman saknar varians. */
export function cronbachAlpha(matrix: ReadonlyArray<readonly number[]>): number | null {
  const k = matrix[0]?.length ?? 0;
  if (k < 2) return null;
  const itemVarSum = Array.from({ length: k }, (_, j) => variance(matrix.map((row) => row[j]!))).reduce(
    (s, v) => s + v,
    0,
  );
  const totals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const totalVar = variance(totals);
  if (totalVar === 0) return null;
  return (k / (k - 1)) * (1 - itemVarSum / totalVar);
}

/** Item-rest-korrelation per fråga (frågan mot summan av övriga frågor). */
export function itemRestCorrelations(matrix: ReadonlyArray<readonly number[]>): (number | null)[] {
  const k = matrix[0]?.length ?? 0;
  return Array.from({ length: k }, (_, j) => {
    const item = matrix.map((row) => row[j]!);
    const rest = matrix.map((row) => row.reduce((s, v, i) => (i === j ? s : s + v), 0));
    return pearson(item, rest);
  });
}

export interface LoevingerResult {
  readonly itemH: (number | null)[];
  readonly scaleH: number | null;
}

/** Loevingers H per fråga och för skalan (polytom kovariansform). */
export function loevingerH(matrix: ReadonlyArray<readonly number[]>): LoevingerResult {
  const k = matrix[0]?.length ?? 0;
  const col = (j: number): number[] => matrix.map((row) => row[j]!);
  const itemNum = Array.from({ length: k }, () => 0);
  const itemDen = Array.from({ length: k }, () => 0);
  let scaleNum = 0;
  let scaleDen = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      const c = covariance(col(i), col(j));
      const cm = covMax(col(i), col(j));
      if (cm <= 0) continue; // minst en konstant fråga i paret: odefinierat, hoppa över
      itemNum[i] += c;
      itemDen[i] += cm;
      itemNum[j] += c;
      itemDen[j] += cm;
      scaleNum += c;
      scaleDen += cm;
    }
  }
  return {
    itemH: itemNum.map((n, i) => (itemDen[i]! > 0 ? n / itemDen[i]! : null)),
    scaleH: scaleDen > 0 ? scaleNum / scaleDen : null,
  };
}

// ---------- samlad rapport ----------

export interface ItemDiagnostics {
  readonly id: string;
  readonly itemRest: number | null;
  readonly h: number | null;
}

export interface ScaleReport {
  readonly scale: string;
  readonly caseCount: number;
  readonly itemCount: number;
  readonly alpha: number | null;
  readonly scaleH: number | null;
  readonly items: ItemDiagnostics[];
}

/** Kör alla mått för en skala. matrix[fall][fråga] i samma ordning som itemIds. */
export function validateScale(
  scale: string,
  itemIds: readonly string[],
  matrix: ReadonlyArray<readonly number[]>,
): ScaleReport {
  const itemRest = itemRestCorrelations(matrix);
  const { itemH, scaleH } = loevingerH(matrix);
  return {
    scale,
    caseCount: matrix.length,
    itemCount: itemIds.length,
    alpha: cronbachAlpha(matrix),
    scaleH,
    items: itemIds.map((id, j) => ({ id, itemRest: itemRest[j] ?? null, h: itemH[j] ?? null })),
  };
}
