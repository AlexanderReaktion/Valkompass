/**
 * Psykometrisk validering av kompassens skalor (ekonomi, GAL-TAN).
 *
 * Samma matematik körs i två lägen:
 *  1. Före lansering: partiernas kanoniska positioner som datamatris
 *     (8 fall = partierna). Detta är en STRUKTURKONTROLL av positionskodningen:
 *     den fångar felriktade frågor och frågor som inte hör hemma på axeln.
 *  2. Efter lansering: användarnas kanoniska svar som datamatris
 *     (`npm run validate:scales -- --anvandardata`, läser responses-storen).
 *     Först då blir alfa-nivåerna tolkbara som väljarreliabilitet.
 *
 * Saknade svar: en cell kan vara null (obesvarad fråga eller "vet ej").
 * Parvisa mått (kovarians, Pearson, covmax, Loevingers H, item-rest) räknar då
 * på de fall där båda variablerna finns; Cronbachs alfa räknar på komplett-fall
 * (rader utan null). För kompletta matriser är alla värden identiska med den
 * klassiska definitionen.
 *
 * Mått:
 *  - Cronbachs alfa: intern konsistens för skalan som helhet.
 *  - Item-rest-korrelation: Pearson-r mellan en fråga och medelvärdet av
 *    personens övriga svar. Negativ betyder att frågan drar åt motsatt håll
 *    (felkodad eller fel axel).
 *  - Loevingers H (polytom kovariansform, Mokken): cov(i,j)/covmax(i,j), där
 *    covmax fås ur rearrangement-olikheten (båda variablerna sorterade
 *    stigande ger största möjliga kovarians givet marginalerna).
 *    Tumregler: H >= 0.3 svag skala, >= 0.4 medel, >= 0.5 stark.
 */

/** Cell i datamatrisen. null = obesvarad/"vet ej" (parvis exkludering). */
export type Cell = number | null;

// ---------- grundstatistik (populationsdefinitioner, n i nämnaren) ----------

/** Plockar ut de index där båda variablerna har värde. */
function completePairs(xs: readonly Cell[], ys: readonly Cell[]): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const y = ys[i];
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      a.push(x);
      b.push(y);
    }
  }
  return [a, b];
}

const meanOf = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

function covComplete(xs: readonly number[], ys: readonly number[]): number {
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i += 1) s += (xs[i]! - mx) * (ys[i]! - my);
  return s / xs.length;
}

/** Parvis kovarians; null när färre än två kompletta par. */
export function covariance(xs: readonly Cell[], ys: readonly Cell[]): number | null {
  const [a, b] = completePairs(xs, ys);
  if (a.length < 2) return null;
  return covComplete(a, b);
}

export const variance = (xs: readonly Cell[]): number | null => covariance(xs, xs);

/** Parvis Pearson-korrelation; null när varians saknas eller för få par. */
export function pearson(xs: readonly Cell[], ys: readonly Cell[]): number | null {
  const [a, b] = completePairs(xs, ys);
  if (a.length < 2) return null;
  const vx = covComplete(a, a);
  const vy = covComplete(b, b);
  if (vx === 0 || vy === 0) return null;
  return covComplete(a, b) / Math.sqrt(vx * vy);
}

/**
 * Största möjliga kovarians givet de två variablernas marginalfördelningar
 * (på de kompletta paren): sortera båda stigande och para ihop
 * (rearrangement-olikheten). null när färre än två kompletta par.
 */
export function covMax(xs: readonly Cell[], ys: readonly Cell[]): number | null {
  const [a, b] = completePairs(xs, ys);
  if (a.length < 2) return null;
  const sa = [...a].sort((p, q) => p - q);
  const sb = [...b].sort((p, q) => p - q);
  return covComplete(sa, sb);
}

// ---------- skalmått ----------

/**
 * Cronbachs alfa på komplett-fall (rader utan null). null när färre än två
 * frågor, färre än två kompletta rader eller när totalsumman saknar varians.
 */
export function cronbachAlpha(matrix: ReadonlyArray<readonly Cell[]>): number | null {
  const k = matrix[0]?.length ?? 0;
  if (k < 2) return null;
  const rows = matrix.filter((row) => row.every((v) => v !== null && v !== undefined)) as number[][];
  if (rows.length < 2) return null;
  let itemVarSum = 0;
  for (let j = 0; j < k; j += 1) {
    const col = rows.map((row) => row[j]!);
    itemVarSum += covComplete(col, col);
  }
  const totals = rows.map((row) => row.reduce((s, v) => s + v, 0));
  const totalVar = covComplete(totals, totals);
  if (totalVar === 0) return null;
  return (k / (k - 1)) * (1 - itemVarSum / totalVar);
}

/** Antal rader utan null (underlaget för Cronbachs alfa). */
export function completeCaseCount(matrix: ReadonlyArray<readonly Cell[]>): number {
  return matrix.filter((row) => row.every((v) => v !== null && v !== undefined)).length;
}

/**
 * Item-rest-korrelation per fråga: frågan mot MEDELVÄRDET av radens övriga
 * besvarade frågor (medel i stället för summa så att rader med olika många
 * svar blir jämförbara; för kompletta matriser ger det identisk korrelation).
 */
export function itemRestCorrelations(matrix: ReadonlyArray<readonly Cell[]>): (number | null)[] {
  const k = matrix[0]?.length ?? 0;
  return Array.from({ length: k }, (_, j) => {
    const item: Cell[] = matrix.map((row) => row[j] ?? null);
    const rest: Cell[] = matrix.map((row) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < k; i += 1) {
        if (i === j) continue;
        const v = row[i];
        if (v !== null && v !== undefined) {
          sum += v;
          n += 1;
        }
      }
      return n > 0 ? sum / n : null;
    });
    return pearson(item, rest);
  });
}

export interface LoevingerResult {
  readonly itemH: (number | null)[];
  readonly scaleH: number | null;
}

/** Loevingers H per fråga och för skalan (polytom kovariansform, parvis). */
export function loevingerH(matrix: ReadonlyArray<readonly Cell[]>): LoevingerResult {
  const k = matrix[0]?.length ?? 0;
  const col = (j: number): Cell[] => matrix.map((row) => row[j] ?? null);
  const itemNum = Array.from({ length: k }, () => 0);
  const itemDen = Array.from({ length: k }, () => 0);
  let scaleNum = 0;
  let scaleDen = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = i + 1; j < k; j += 1) {
      const c = covariance(col(i), col(j));
      const cm = covMax(col(i), col(j));
      if (c === null || cm === null || cm <= 0) continue; // konstant/odefinierat par: hoppa över
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
  matrix: ReadonlyArray<readonly Cell[]>,
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
