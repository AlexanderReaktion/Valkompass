/**
 * Empirisk validering av kompassens skalor.
 *
 * Läge 1 (standard): datamatrisen är partiernas kanoniska positioner (8 fall).
 * Detta validerar POSITIONSKODNINGENS struktur: att frågorna på en axel ordnar
 * partierna åt samma håll. Alfa-nivåerna ska läsas som strukturindikatorer,
 * med n = 8 är osäkerheten stor.
 *   Kör: npm run validate:scales
 *
 * Läge 2 (--anvandardata): samma mått på användarnas lagrade kanoniska svar
 * (responses-storen: Postgres när DATABASE_URL är satt, annars fillagringen i
 * ./.data). Variantformuleringar slås ihop till sin sakfrågegrupp; obesvarat
 * och "vet ej" blir null och hanteras parvis. Först här blir Cronbachs alfa en
 * riktig väljarreliabilitet och Mokken-tumreglerna (H >= 0.3) fullt tillämpliga.
 *   Kör mot prod: DATABASE_URL=<supabase-url> npm run validate:scales -- --anvandardata
 */

import { catalog2026Positions, catalog2026Questions } from "../src/data/catalog2026.ts";
import { equivalenceKey, uniqueGroupQuestions } from "../src/kompass/testPlan.ts";
import { getStores } from "../src/store/index.ts";
import { pearson, validateScale } from "../src/analysis/scaleValidation.ts";
import type { Cell, ScaleReport } from "../src/analysis/scaleValidation.ts";

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

function summarize(reports: readonly ScaleReport[]): void {
  const flagged = reports.flatMap((r) =>
    r.items.filter((i) => i.itemRest === null || i.h === null || i.itemRest < 0.3 || i.h < 0.3).map((i) => `${r.scale}:${i.id}`),
  );
  console.log(`\nSammanfattning: ${flagged.length} flaggade frågor${flagged.length > 0 ? ` (${flagged.join(", ")})` : ""}.`);
}

const unique = uniqueGroupQuestions(catalog2026Questions);
const itemsByDim = (dim: "economic" | "galtan"): string[] =>
  unique.filter((q) => q.dimension === dim).map((q) => q.id);

// ---------- läge 1: partipositioner (strukturkontroll) ----------

function runPartyMode(): void {
  const reports: ScaleReport[] = [];
  for (const dim of ["economic", "galtan"] as const) {
    const items = itemsByDim(dim);
    const report = validateScale(dim, items, matrixFor(items));
    reports.push(report);
    printReport(dim === "economic" ? "Ekonomisk vänster–höger" : "GAL–TAN (värderingar)", report);
  }

  // Axelkorrelation: mäter om kartans två dimensioner faktiskt är två.
  const scoresFor = (dim: "economic" | "galtan"): number[] =>
    matrixFor(itemsByDim(dim)).map((row) => row.reduce((s, v) => s + v, 0) / row.length);
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

  summarize(reports);
  console.log(
    "OBS: n = 8 partier. Detta är en strukturkontroll av positionskodningen, med breda osäkerhetsmarginaler.\n" +
      "Kör med --anvandardata efter lansering för riktig väljarreliabilitet på lagrade svar.",
  );
}

// ---------- läge 2: användardata (riktiga svar ur storen) ----------

async function runUserDataMode(): Promise<void> {
  const stores = await getStores();
  const results = await stores.responses.listResults();
  if (results.length === 0) {
    console.log(
      "Inga lagrade svar hittades i storen.\n" +
        "Lokalt läses ./.data (fillagringen); mot produktionen: sätt DATABASE_URL till Supabase-anslutningen och kör igen.\n" +
        "Svar lagras när en användare skickar in kommentarer med samtycke.",
    );
    return;
  }

  // Mappa varje formulering (inkl. _alt-varianter) till sin sakfrågegrupp och
  // gruppens dimension. Okända id:n (t.ex. frågor som utgått) hoppas över.
  const dimensionByGroup = new Map<string, "economic" | "galtan">();
  for (const q of unique) if (q.dimension) dimensionByGroup.set(q.id, q.dimension);

  const buildMatrix = (items: readonly string[]): Cell[][] =>
    results.map((r) => {
      const byGroup = new Map<string, Cell>();
      for (const [servedId, a] of Object.entries(r.canonicalAnswers)) {
        byGroup.set(equivalenceKey(servedId), a.value);
      }
      return items.map((id) => byGroup.get(id) ?? null);
    });

  console.log(`Användardata: ${results.length} lagrade körningar (en rad per körning; obesvarat/vet ej = null, parvis exkludering).`);
  const reports: ScaleReport[] = [];
  for (const dim of ["economic", "galtan"] as const) {
    const items = itemsByDim(dim).filter((id) => dimensionByGroup.get(id) === dim);
    const report = validateScale(dim, items, buildMatrix(items));
    reports.push(report);
    printReport(dim === "economic" ? "Ekonomisk vänster–höger" : "GAL–TAN (värderingar)", report);
  }

  // Axelkorrelation på respondentnivå: medel av besvarade frågor per axel.
  const meanFor = (items: readonly string[]): Cell[] =>
    buildMatrix(items).map((row) => {
      const vals = row.filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
  const axisR = pearson(meanFor(itemsByDim("economic")), meanFor(itemsByDim("galtan")));
  console.log(`\nKorrelation mellan axlarna (respondentnivå): ${fmt(axisR)}`);

  summarize(reports);
  if (results.length < 200) {
    console.log(`OBS: n = ${results.length} är för litet för stabila skattningar; tolka som tidiga indikationer.`);
  }
}

// ---------- kör ----------

if (process.argv.includes("--anvandardata")) {
  await runUserDataMode();
} else {
  runPartyMode();
}
