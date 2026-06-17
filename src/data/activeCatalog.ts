/**
 * Den katalog som serveras i kompassen just nu.
 *
 * Pekar på den AI-researchade 2026-katalogen (45 frågor, 360 källbelagda
 * positioner). Positionerna är UTKAST under expertgranskning i /admin — när
 * en granskad katalog publiceras via admin-publish bör detta bytas till att
 * läsa store.getPublished(). Tills dess serveras 2026-utkastet.
 */

import type { PublishedCatalog } from "../catalog/types.ts";
import type { Party, Scale } from "../matching/types.ts";
import { catalog2026Positions, catalog2026Questions } from "./catalog2026.ts";

export const activeScale: Scale = { min: -2, max: 2 };

const NAMES: Record<string, string> = {
  V: "Vänsterpartiet",
  S: "Socialdemokraterna",
  MP: "Miljöpartiet",
  C: "Centerpartiet",
  L: "Liberalerna",
  KD: "Kristdemokraterna",
  M: "Moderaterna",
  SD: "Sverigedemokraterna",
};

export const activeCatalog: PublishedCatalog = {
  version: 1,
  election: "riksdagsval-2026",
  publishedAt: "2026-06-17T00:00:00.000Z",
  scale: activeScale,
  questions: catalog2026Questions,
};

export const activeParties: Party[] = Object.keys(NAMES).map((id) => ({
  id,
  name: NAMES[id]!,
  positions: Object.fromEntries(
    catalog2026Positions.filter((p) => p.partyId === id).map((p) => [p.questionId, p.value]),
  ),
}));
