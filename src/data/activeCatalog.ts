/**
 * Aktiv katalog för kompassen.
 *
 * Runtime läser i första hand den senast publicerade katalogen från store.
 * Finns ingen publicerad katalog faller appen tillbaka till det researchade
 * 2026-utkastet, tydligt markerat i UI:t.
 */

import type { PartyPosition, PublishedCatalog } from "../catalog/types.ts";
import type { Party, Scale } from "../matching/types.ts";
import { getStores } from "../store/index.ts";
import { catalog2026Positions, catalog2026Questions } from "./catalog2026.ts";

export const ACTIVE_ELECTION = "riksdagsval-2026";
export const activeScale: Scale = { min: -2, max: 2 };

export const partyMeta = [
  { id: "V", name: "Vänsterpartiet" },
  { id: "S", name: "Socialdemokraterna" },
  { id: "MP", name: "Miljöpartiet" },
  { id: "C", name: "Centerpartiet" },
  { id: "L", name: "Liberalerna" },
  { id: "KD", name: "Kristdemokraterna" },
  { id: "M", name: "Moderaterna" },
  { id: "SD", name: "Sverigedemokraterna" },
] as const;

const NAMES: Record<string, string> = Object.fromEntries(partyMeta.map((p) => [p.id, p.name]));

export const activeCatalog: PublishedCatalog = {
  version: 1,
  election: ACTIVE_ELECTION,
  publishedAt: "2026-06-17T00:00:00.000Z",
  scale: activeScale,
  questions: catalog2026Questions,
};

function positionsForCatalog(
  catalog: PublishedCatalog,
  positions: readonly PartyPosition[],
  requireApproved: boolean,
): PartyPosition[] {
  const questionIds = new Set(catalog.questions.map((q) => q.id));
  return positions.filter((p) => questionIds.has(p.questionId) && (!requireApproved || p.status === "approved"));
}

export function buildParties(positions: readonly PartyPosition[]): Party[] {
  return partyMeta.map((p) => ({
    id: p.id,
    name: p.name,
    positions: Object.fromEntries(
      positions.filter((pos) => pos.partyId === p.id).map((pos) => [pos.questionId, pos.value]),
    ),
  }));
}

export const activeParties: Party[] = buildParties(catalog2026Positions);

/** Källa per (partyId::questionId) för transparens på resultatsidan. */
export function buildSources(positions: readonly PartyPosition[]): Record<string, { label: string; url: string }> {
  return Object.fromEntries(positions.flatMap((p) => {
    const c = p.citations[0];
    return c && c.url ? [[`${p.partyId}::${p.questionId}`, { label: c.label, url: c.url }] as const] : [];
  }));
}

export const activeSources: Record<string, { label: string; url: string }> = buildSources(catalog2026Positions);

export interface ActiveDataset {
  readonly catalog: PublishedCatalog;
  readonly parties: Party[];
  readonly scale: Scale;
  readonly sources: Record<string, { label: string; url: string }>;
  readonly isPublished: boolean;
}

/**
 * Instans-lokal cache av det aktiva datasetet. Katalogen ändras bara vid
 * publicering, men loadActiveDataset anropas på VARJE /kompass- och
 * /api/analyze-request; utan cache blir databasen (session-poolerns 15
 * klienter) flaskhals under trafiktoppar när serverless skalar ut
 * (EMAXCONNSESSION-incidenten 2026-07-17). Med 60 s TTL frågar varje varm
 * instans databasen högst en gång i minuten, och en ny publicering slår
 * igenom inom en minut. Fel cachas aldrig.
 */
const DATASET_TTL_MS = 60_000;
let datasetCache: { readonly value: ActiveDataset; readonly expires: number; readonly election: string } | null = null;

/** Testhjälp: nollställ cachen mellan testfall. */
export function _resetDatasetCacheForTest(): void {
  datasetCache = null;
}

export async function loadActiveDataset(election: string = ACTIVE_ELECTION): Promise<ActiveDataset> {
  const now = Date.now();
  if (datasetCache && datasetCache.election === election && now < datasetCache.expires) {
    return datasetCache.value;
  }

  const stores = await getStores();
  const published = await stores.catalog.getPublished(election);
  if (published) {
    const positions = positionsForCatalog(published, await stores.catalog.listPositions(), true);
    const dataset: ActiveDataset = {
      catalog: published,
      parties: buildParties(positions),
      scale: published.scale,
      sources: buildSources(positions),
      isPublished: true,
    };
    datasetCache = { value: dataset, expires: now + DATASET_TTL_MS, election };
    return dataset;
  }

  // Ingen publicerad katalog finns – vi skulle falla tillbaka till det OGRANSKADE
  // AI-utkastet för 2026. I produktion (Vercel/production) får detta inte ske utan
  // ett uttryckligt opt-in, så att opublicerade positioner aldrig serveras publikt.
  const isProd = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  if (isProd && process.env.ALLOW_DRAFT_CATALOG !== "true") {
    throw new Error(
      "Ingen publicerad katalog finns. I produktion vägrar appen att servera det ogranskade " +
        "2026-utkastet. Publicera och godkänn katalogen i /admin, eller sätt ALLOW_DRAFT_CATALOG=true " +
        "för staging/test.",
    );
  }

  const fallback: ActiveDataset = {
    catalog: activeCatalog,
    parties: activeParties,
    scale: activeScale,
    sources: activeSources,
    isPublished: false,
  };
  datasetCache = { value: fallback, expires: now + DATASET_TTL_MS, election };
  return fallback;
}

export const partyNames = NAMES;
