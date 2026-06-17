/**
 * DEMO-katalog — ENBART för att driva UI:t under utveckling.
 *
 * ⚠️ Partipositionerna nedan är ILLUSTRATIVA PLATSHÅLLARE, inte researchade
 * ståndpunkter. De ersätts senare av RAG-pipelinen (riksdagsdata + partiprogram)
 * med citat och mänskligt godkännande. Frågetexterna är neutralt formulerade
 * enligt docs/fragor-riktlinjer.md men inte slutgranskade.
 *
 * Dubblar som körbart exempel på katalog-domänens API.
 */

import {
  approvePosition,
  approveQuestion,
  createQuestion,
  publishCatalog,
} from "../catalog/catalog.ts";
import type { PartyPosition, PublishedCatalog } from "../catalog/types.ts";
import type { Party, Scale } from "../matching/types.ts";

const NOW = "2026-06-15T00:00:00.000Z";

export const demoScale: Scale = { min: -2, max: 2 };

const questions = [
  createQuestion(
    { id: "q1", kind: "structural", dimension: "economic", polarity: 1, topic: "skatter", text: "Skatten på arbete bör sänkas.", rationale: "Delar partierna i fördelningspolitiken." },
    NOW,
  ),
  createQuestion(
    { id: "q2", kind: "structural", dimension: "economic", polarity: -1, topic: "välfärd", text: "Offentliga utförare bör ta över mer av äldreomsorgen från privata företag.", rationale: "Skiljelinje om välfärdens organisering (omvänt formulerad för polaritetsbalans)." },
    NOW,
  ),
  createQuestion(
    { id: "q3", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Sverige bör ta emot färre asylsökande.", rationale: "Tydlig skiljelinje på värderingsdimensionen." },
    NOW,
  ),
  createQuestion(
    { id: "q4", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Sverige bör föra en mer öppen flyktingpolitik.", rationale: "Motpol till q3 med varierad polaritet." },
    NOW,
  ),
  createQuestion(
    { id: "q5", kind: "structural", dimension: "economic", polarity: 1, topic: "välfärd", text: "Privata företag bör få göra vinst på skattefinansierad skola och vård.", rationale: "Klassisk höger-vänster-fråga." },
    NOW,
  ),
  createQuestion(
    { id: "q6", kind: "dynamic", polarity: 1, topic: "energi", text: "Kärnkraften bör byggas ut.", rationale: "Aktuell energifråga utan tydlig kartaxel." },
    NOW,
  ),
].map((q) => approveQuestion(q, "demo", NOW));

export const demoPartyMeta = [
  { id: "V", name: "Vänsterpartiet" },
  { id: "S", name: "Socialdemokraterna" },
  { id: "MP", name: "Miljöpartiet" },
  { id: "C", name: "Centerpartiet" },
  { id: "L", name: "Liberalerna" },
  { id: "KD", name: "Kristdemokraterna" },
  { id: "M", name: "Moderaterna" },
  { id: "SD", name: "Sverigedemokraterna" },
] as const;

// Kanoniska (av-polariserade) DEMO-värden. Konvention: högre = mer höger (economic) / mer TAN (galtan).
// ILLUSTRATIVA platshållare — INTE researchade ståndpunkter.
const values: Record<string, Record<string, number>> = {
  q1: { V: -2, S: -1, MP: -1, C: 1, L: 2, KD: 1, M: 2, SD: 0 },
  q2: { V: -2, S: -1, MP: -1, C: 1, L: 2, KD: 0, M: 2, SD: 0 },
  q3: { V: -1, S: 0, MP: -2, C: -1, L: 0, KD: 1, M: 1, SD: 2 },
  q4: { V: -1, S: 0, MP: -2, C: -1, L: 0, KD: 1, M: 1, SD: 2 },
  q5: { V: -2, S: -1, MP: 0, C: 1, L: 2, KD: 1, M: 2, SD: 0 },
  q6: { V: -2, S: 0, MP: -2, C: -1, L: 2, KD: 2, M: 2, SD: 2 },
};

export const demoPositions: PartyPosition[] = [];
for (const q of questions) {
  for (const p of demoPartyMeta) {
    demoPositions.push(
      approvePosition(
        {
          questionId: q.id,
          partyId: p.id,
          value: values[q.id][p.id],
          citations: [{ label: "DEMO – ej verifierad källa" }],
          status: "draft",
        },
        "demo",
        NOW,
      ),
    );
  }
}

export const demoCatalog: PublishedCatalog = publishCatalog(
  {
    questions,
    parties: demoPartyMeta.map((p) => ({ id: p.id, name: p.name })),
    positions: demoPositions,
    scale: demoScale,
    version: 1,
    election: "riksdagsval-2026-DEMO",
    minQuestions: 1,
  },
  NOW,
);

/** Partier i matchningsmotorns form (kanoniska positioner per fråga). */
export const demoParties: Party[] = demoPartyMeta.map((p) => ({
  id: p.id,
  name: p.name,
  positions: Object.fromEntries(questions.map((q) => [q.id, values[q.id][p.id]])),
}));
