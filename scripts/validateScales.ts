/**
 * Empirisk validering av kompassens skalor (körs: npm run validate:scales).
 *
 * Läge 1 (nu, före lansering): datamatrisen är partiernas kanoniska positioner
 * (8 fall). Detta validerar POSITIONSKODNINGENS struktur: att frågorna på en
 * axel ordnar partierna åt samma håll. Alfa-nivåerna ska läsas som
 * strukturindikatorer, med n = 8 är osäkerheten stor.
 *
 * Läge 2 (efter lansering): kör samma mått på användarnas kanoniska svar.
 * Svaren finns i responses-storen (saveResult → canonicalAnswers). Exportera
 * dem till en matris [respondent][fråga] och anropa validateScale på samma
 * sätt som nedan; först då är Cronbachs alfa en riktig väljarreliabilitet
 * och Mokken-tumreglerna (H >= 0.3) tillämpliga fullt ut.
 */

import { catalog2026Positions, catalog2026Questions } from "../src/data/catalog2026.ts";
import { uniqueGroupQuestions } from "../src/kompass/testPlan.ts";
import { pearson, validateScale } from "../src/analysis/scaleValidation.ts";
import type { ScaleReport } from "../src/analysis/scaleValidation.ts";

const PARTIES = ["V", "S", "MP", "C", "L", "KD", "M", "SD"] as const;

const positionByKey = new Map(catalog2026Positions.map((p) => [`${p.questionId}::${p.partyId}`, p.value]));

function matrixFor(itemIds: readonly string[]): number[][] {
  return PARTIES.map((party) =>
    itemIds.map((q) => {
      const v = positionByKey.get(`${q}::${party}`);
      if (v === undefined) throw new Error(`Saknar position ${q}/${party}`);
      return v;
    }),
  );
}

const fmt = (v: number | null): string => (v === null ? "  n/a" : (v >= 0 ? " " : "") + v.toFixed(2));

function flagFor(itemRest: number | null, h: number | null): string {
  if (itemRest === null || h === null) return "konstant/odefinierad";
  if (itemRest < 0 || h < 0) return "FELRIKTAD – drar åt motsatt håll, granska kodningen eller flytta av axeln";
  if (itemRest < 0.3 || h < 0.3) return "svag – skalar dåligt, kandidat för granskning";
  return "";
}

function printReport(title: string, report: ScaleReport): void {
  console.log(`\n=== ${title} ===`);
  console.log(`Frågor: ${report.itemCount} · Fall (partier): ${report.caseCount}`);
  console.log(`Cronbachs alfa: ${fmt(report.alpha)} · Loevingers H (skala): ${fmt(report.scaleH)}`);
  console.log(`\n${"fråga".padEnd(22)} ${"item-rest".padStart(9)} ${"H".padStart(6)}  flagga`);
  const sorted = [...report.items].sort((a, b) => (a.h ?? -99) - (b.h ?? -99));
  for (const item of sorted) {
    console.log(`${item.id.padEnd(22)} ${fmt(item.itemRest).padStart(9)} ${fmt(item.h).padStart(6)}  ${flagFor(item.itemRest, item.h)}`);
  }
}

// ---------- kör ----------

const unique = uniqueGroupQuestions(catalog2026Questions);
const reports: ScaleReport[] = [];

for (const dim of ["economic", "galtan"] as const) {
  const items = unique.filter((q) => q.dimension === dim).map((q) => q.id);
  const report = validateScale(dim, items, matrixFor(items));
  reports.push(report);
  printReport(dim === "economic" ? "Ekonomisk vänster–höger" : "GAL–TAN (värderingar)", report);
}

// Axelkorrelation: mäter om kartans två dimensioner faktiskt är två.
const scoresFor = (dim: "economic" | "galtan"): number[] => {
  const items = unique.filter((q) => q.dimension === dim).map((q) => q.id);
  return matrixFor(items).map((row) => row.reduce((s, v) => s + v, 0) / row.length);
};
const econScores = scoresFor("economic");
const galtanScores = scoresFor("galtan");
const axisR = pearson(econScores, galtanScores);

console.log("\n=== Axlarnas självständighet ===");
console.log(`${"parti".padEnd(6)} ${"ekonomi".padStart(8)} ${"gal-tan".padStart(8)}`);
PARTIES.forEach((p, i) => {
  console.log(`${p.padEnd(6)} ${fmt(econScores[i]!).padStart(8)} ${fmt(galtanScores[i]!).padStart(8)}`);
});
console.log(`Korrelation mellan axlarna (parti-nivå): ${fmt(axisR)}`);
if (axisR !== null && Math.abs(axisR) > 0.85) {
  console.log("VARNING: axlarna är nära kollineära – 2D-kartan tillför då lite utöver en enda skala.");
}

const flagged = reports.flatMap((r) =>
  r.items.filter((i) => i.itemRest === null || i.h === null || i.itemRest < 0.3 || i.h < 0.3).map((i) => `${r.scale}:${i.id}`),
);
console.log(`\nSammanfattning: ${flagged.length} flaggade frågor${flagged.length > 0 ? ` (${flagged.join(", ")})` : ""}.`);
console.log(
  "OBS: n = 8 partier. Detta är en strukturkontroll av positionskodningen, med breda osäkerhetsmarginaler.\n" +
    "Kör om på användardata efter lansering (canonicalAnswers i responses-storen) för riktig reliabilitet.",
);
