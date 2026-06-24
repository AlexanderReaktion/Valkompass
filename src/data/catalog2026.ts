/**
 * AI-RESEARCHAT UTKAST — frågebank (45 sakfrågegrupper, 60 formuleringar)
 * + partipositioner (480) inför
 * riksdagsvalet 2026.
 *
 * ⚠️ Utkast (status: draft). Positionerna är framtagna av per-parti-research mot
 * AKTUELLA källor (partiprogram/valmanifest 2026, press-releaser, media,
 * riksdagsmotioner/voteringar). De MÅSTE expertgranskas och godkännas i /admin
 * innan publicering. Källa per position finns i src/data/positions2026/<PARTI>.ts.
 *
 * Konvention: kanoniskt värde, högre = mer höger (economic) / mer TAN (galtan);
 * för energi/försvar/EU högre = "för/restriktiv". polarity = visningspolaritet
 * (hanteras vid intag; motorn arbetar kanoniskt).
 */

import { createQuestion } from "../catalog/catalog.ts";
import type { CatalogQuestion, PartyPosition } from "../catalog/types.ts";
import type { Dimension, Polarity } from "../matching/types.ts";
import type { PositionRow } from "./positions2026/types.ts";
import V from "./positions2026/V.ts";
import S from "./positions2026/S.ts";
import MP from "./positions2026/MP.ts";
import C from "./positions2026/C.ts";
import L from "./positions2026/L.ts";
import KD from "./positions2026/KD.ts";
import M from "./positions2026/M.ts";
import SD from "./positions2026/SD.ts";

const NOW = "2026-06-17T00:00:00.000Z";

interface QDef {
  id: string;
  kind: CatalogQuestion["kind"];
  dimension?: Dimension;
  polarity: Polarity;
  topic: string;
  text: string;
  rationale: string;
  positionSourceId?: string;
}

const QDEFS: QDef[] = [
  // Ekonomisk vänster–höger
  { id: "skatt_arbete", kind: "structural", dimension: "economic", polarity: 1, topic: "skatter", text: "Skatten på arbete bör sänkas.", rationale: "Klassisk fördelningspolitisk skiljelinje." },
  { id: "hoginkomstskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Höginkomsttagare bör betala mer i skatt.", rationale: "Omvänt formulerad; skiljer vänster/höger tydligt." },
  { id: "bolagsskatt", kind: "structural", dimension: "economic", polarity: 1, topic: "företag", text: "Bolagsskatten bör sänkas.", rationale: "Synen på företagande och skatt." },
  { id: "kapitalskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Skatten på kapital och stora förmögenheter bör höjas.", rationale: "Fördelning kapital vs arbete." },
  { id: "offentliga_utgifter", kind: "structural", dimension: "economic", polarity: -1, topic: "ekonomi", text: "Den offentliga välfärden bör byggas ut även om det kräver höjda skatter.", rationale: "Statens storlek." },
  { id: "rutrot", kind: "dynamic", dimension: "economic", polarity: 1, topic: "skatter", text: "RUT- och ROT-avdragen bör utökas.", rationale: "Aktuell skattefråga." },
  { id: "vinst_valfard", kind: "structural", dimension: "economic", polarity: 1, topic: "välfärd", text: "Privata företag bör få göra vinst på skattefinansierad skola och vård.", rationale: "Vinster i välfärden – tydlig skiljelinje." },
  { id: "offentlig_ansvar", kind: "structural", dimension: "economic", polarity: -1, topic: "välfärd", text: "Offentliga utförare bör ta ett större ansvar för välfärden än privata.", rationale: "Välfärdens organisering." },
  { id: "arbetsratt", kind: "structural", dimension: "economic", polarity: 1, topic: "arbetsmarknad", text: "Arbetsmarknaden bör avregleras så att det blir enklare att anställa och säga upp.", rationale: "Arbetsrätt – höger/vänster." },
  { id: "akassa", kind: "structural", dimension: "economic", polarity: 1, topic: "trygghet", text: "Ersättningsnivåerna i a-kassa och sjukförsäkring bör sänkas.", rationale: "Trygghetssystemens nivåer." },
  { id: "forsorjningsstod", kind: "dynamic", dimension: "economic", polarity: 1, topic: "bidrag", text: "Försörjningsstödet bör villkoras hårdare med krav på aktivitet.", rationale: "Aktuell bidragsfråga." },
  { id: "pension", kind: "structural", dimension: "economic", polarity: -1, topic: "pension", text: "Pensionerna bör höjas även om det kräver höjda skatter eller avgifter.", rationale: "Pension vs skatt." },
  { id: "vard_resurser", kind: "dynamic", dimension: "economic", polarity: -1, topic: "sjukvård", text: "Mer skattemedel bör tillföras sjukvården även om det kräver höjda skatter.", rationale: "Salient: vårdens resurser." },
  { id: "friskolor", kind: "structural", dimension: "economic", polarity: 1, topic: "skola", text: "Det fria skolvalet och friskolor bör värnas och utvecklas.", rationale: "Skolval – höger/vänster." },
  { id: "vinst_skola", kind: "structural", dimension: "economic", polarity: 1, topic: "skola", text: "Vinstutdelning i friskolor bör tillåtas.", rationale: "Vinst i skolan." },
  // Värderingar GAL–TAN
  { id: "asyl_farre", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Sverige bör ta emot färre asylsökande.", rationale: "Central GAL–TAN-fråga." },
  { id: "flykting_oppen", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Sverige bör föra en mer öppen och human flyktingpolitik.", rationale: "Motpol; varierad polaritet." },
  { id: "medborgarskap", kind: "structural", dimension: "galtan", polarity: 1, topic: "integration", text: "Kraven för svenskt medborgarskap bör skärpas.", rationale: "Aktuellt lagförslag 2025/26." },
  { id: "anpassning", kind: "structural", dimension: "galtan", polarity: 1, topic: "integration", text: "Krav på anpassning till svenska seder och språk bör skärpas för invandrare.", rationale: "Integrations-/värderingsfråga." },
  { id: "atervandring", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Sverige bör satsa mer på att invandrare som inte integreras återvänder.", rationale: "Återvändandepolitik." },
  { id: "anhorig", kind: "structural", dimension: "galtan", polarity: 1, topic: "migration", text: "Möjligheten till anhöriginvandring bör begränsas.", rationale: "Anhöriginvandring." },
  { id: "straff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Straffen för grova brott bör skärpas.", rationale: "Lag och ordning – salient." },
  { id: "polisbefogenheter", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Polisen bör få utökade befogenheter, t.ex. mer övervakning.", rationale: "Befogenheter vs integritet." },
  { id: "visitationszoner", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Visitationszoner bör införas där polisen får visitera utan konkret misstanke.", rationale: "Omdebatterat verktyg." },
  { id: "ungdomsstraff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Unga som begår grova brott bör kunna dömas som vuxna.", rationale: "Straffmyndighet/unga." },
  { id: "forebyggande", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "brottslighet", text: "Brottsbekämpning bör främst fokusera på förebyggande sociala insatser.", rationale: "Förebyggande vs repressivt." },
  { id: "integritet", kind: "structural", dimension: "galtan", polarity: -1, topic: "integritet", text: "Personlig integritet bör väga tyngre än utökad övervakning.", rationale: "Integritet vs övervakning." },
  { id: "klimat_prioritet", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "klimat", text: "Klimatomställningen bör prioriteras även med högre kostnader på kort sikt.", rationale: "Värderingsdimension; tvåsidig stam." },
  { id: "miljoskatter", kind: "structural", dimension: "galtan", polarity: -1, topic: "klimat", text: "Miljöskatter på t.ex. flyg och utsläpp bör höjas.", rationale: "Miljöstyrande skatter." },
  { id: "naturskydd", kind: "structural", dimension: "galtan", polarity: -1, topic: "miljö", text: "Mer skog och natur bör skyddas även om det begränsar skogsbruk.", rationale: "Naturskydd vs brukande." },
  { id: "foraldraforsakring", kind: "structural", dimension: "galtan", polarity: -1, topic: "familj", text: "Föräldraförsäkringen bör delas mer jämställt mellan föräldrarna.", rationale: "Jämställdhet/familj." },
  { id: "abort", kind: "structural", dimension: "galtan", polarity: -1, topic: "rättigheter", text: "Rätten till abort bör värnas och stärkas.", rationale: "Värderingsmarkör." },
  { id: "hbtqi", kind: "structural", dimension: "galtan", polarity: -1, topic: "rättigheter", text: "Hbtqi-personers rättigheter bör stärkas ytterligare.", rationale: "GAL–TAN-markör." },
  { id: "eu_makt", kind: "structural", dimension: "galtan", polarity: -1, topic: "EU", text: "Mer makt bör överföras till EU för gemensamma beslut.", rationale: "EU/suveränitet." },
  { id: "public_service", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "media", text: "Public service bör bantas och finansieringen minskas.", rationale: "Synen på public service." },
  { id: "monarki", kind: "structural", dimension: "galtan", polarity: -1, topic: "demokrati", text: "Monarkin bör avskaffas.", rationale: "Republik vs monarki." },
  // Energi / försvar / EU (ingen kartaxel)
  { id: "bensinskatt", kind: "dynamic", polarity: 1, topic: "drivmedel", text: "Skatten på bensin och diesel bör sänkas.", rationale: "Aktuell prisfråga." },
  { id: "bistand", kind: "dynamic", polarity: 1, topic: "bistånd", text: "Sveriges utvecklingsbistånd bör minskas.", rationale: "Biståndsnivå." },
  { id: "arbetskraftsinvandring", kind: "dynamic", polarity: 1, topic: "arbetsmarknad", text: "Reglerna för arbetskraftsinvandring bör skärpas.", rationale: "Aktuellt; tvärgående." },
  { id: "karnkraft", kind: "dynamic", polarity: 1, topic: "energi", text: "Kärnkraften bör byggas ut med statligt stöd.", rationale: "Energifråga; C för kärnkraft men mot statligt stöd." },
  { id: "vindkraft", kind: "dynamic", polarity: -1, topic: "energi", text: "Utbyggnaden av vindkraft bör påskyndas.", rationale: "Energimix." },
  { id: "reduktionsplikt", kind: "dynamic", polarity: 1, topic: "drivmedel", text: "Reduktionsplikten bör sänkas för lägre bränslepriser.", rationale: "Klimat vs pris." },
  { id: "nato", kind: "dynamic", polarity: 1, topic: "försvar", text: "Sverige bör fördjupa sitt försvarssamarbete inom NATO.", rationale: "Försvarsfråga." },
  { id: "forsvarsanslag", kind: "dynamic", polarity: 1, topic: "försvar", text: "Försvarsanslagen bör öka ytterligare.", rationale: "Försvarsekonomi." },
  { id: "euro", kind: "dynamic", polarity: 1, topic: "EU", text: "Sverige bör införa euron.", rationale: "Valutafråga." },
];

const VARIANT_QDEFS: QDef[] = [
  { id: "skatt_arbete_alt", positionSourceId: "skatt_arbete", kind: "structural", dimension: "economic", polarity: 1, topic: "skatter", text: "Inkomstskatten för löntagare bör bli lägre.", rationale: "Alternativ neutral formulering av arbetsbeskattning." },
  { id: "hoginkomstskatt_alt", positionSourceId: "hoginkomstskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Skattesystemet bör omfördela mer från höga inkomster.", rationale: "Alternativ formulering av progressiv beskattning." },
  { id: "offentliga_utgifter_alt", positionSourceId: "offentliga_utgifter", kind: "structural", dimension: "economic", polarity: -1, topic: "ekonomi", text: "Staten bör finansiera mer välfärd även om skattetrycket ökar.", rationale: "Alternativ formulering av statens storlek och finansiering." },
  { id: "vinst_valfard_alt", positionSourceId: "vinst_valfard", kind: "structural", dimension: "economic", polarity: 1, topic: "välfärd", text: "Skattefinansierad vård och skola bör kunna drivas med vinst.", rationale: "Alternativ formulering av vinstfrågan." },
  { id: "arbetsratt_alt", positionSourceId: "arbetsratt", kind: "structural", dimension: "economic", polarity: 1, topic: "arbetsmarknad", text: "Reglerna på arbetsmarknaden bör göra det lättare för arbetsgivare att säga upp personal.", rationale: "Alternativ formulering av arbetsrättens flexibilitet." },
  { id: "asyl_farre_alt", positionSourceId: "asyl_farre", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Asylmottagandet bör vara mer restriktivt än i dag.", rationale: "Alternativ formulering av restriktiv asylpolitik." },
  { id: "flykting_oppen_alt", positionSourceId: "flykting_oppen", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Sverige bör lägga större vikt vid skyddsskäl än vid att minska flyktingmottagandet.", rationale: "Alternativ formulering av öppen flyktingpolitik." },
  { id: "straff_alt", positionSourceId: "straff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Längre fängelsestraff bör användas oftare vid grov brottslighet.", rationale: "Alternativ formulering av straffskärpningar." },
  { id: "forebyggande_alt", positionSourceId: "forebyggande", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "brottslighet", text: "Sociala förebyggande insatser bör prioriteras framför fler straffskärpningar.", rationale: "Alternativ formulering av förebyggande kriminalpolitik." },
  { id: "klimat_prioritet_alt", positionSourceId: "klimat_prioritet", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "klimat", text: "Klimatåtgärder bör genomföras även om de blir märkbara för hushåll och företag.", rationale: "Alternativ formulering av klimatets kostnadsavvägning." },
  { id: "karnkraft_alt", positionSourceId: "karnkraft", kind: "dynamic", polarity: 1, topic: "energi", text: "Ny kärnkraft bör få statligt stöd för att byggas snabbare.", rationale: "Alternativ formulering av kärnkraftsutbyggnad." },
  { id: "vindkraft_alt", positionSourceId: "vindkraft", kind: "dynamic", polarity: -1, topic: "energi", text: "Tillståndsprocesser bör förenklas så att mer vindkraft kan byggas.", rationale: "Alternativ formulering av vindkraftsutbyggnad." },
  { id: "nato_alt", positionSourceId: "nato", kind: "dynamic", polarity: 1, topic: "försvar", text: "Sverige bör knyta sitt försvar ännu närmare NATO.", rationale: "Alternativ formulering av fördjupat NATO-samarbete." },
  { id: "eu_makt_alt", positionSourceId: "eu_makt", kind: "structural", dimension: "galtan", polarity: -1, topic: "EU", text: "Fler beslut bör fattas gemensamt inom EU även om Sverige lämnar över mer makt.", rationale: "Alternativ formulering av EU-integration." },
  { id: "public_service_alt", positionSourceId: "public_service", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "media", text: "Public service bör ha ett smalare uppdrag och mindre finansiering.", rationale: "Alternativ formulering av public service-frågan." },
];

const ALL_QDEFS = [...QDEFS, ...VARIANT_QDEFS];
const POSITION_SOURCE_BY_QUESTION = new Map(
  VARIANT_QDEFS.map((q) => [q.id, q.positionSourceId ?? q.id] as const),
);

export const catalog2026Questions: CatalogQuestion[] = ALL_QDEFS.map((d) =>
  createQuestion(
    { id: d.id, kind: d.kind, polarity: d.polarity, topic: d.topic, text: d.text, rationale: d.rationale, ...(d.dimension ? { dimension: d.dimension } : {}) },
    NOW,
  ),
);

const PARTY_ROWS: Record<string, PositionRow[]> = { V, S, MP, C, L, KD, M, SD };
const clamp = (v: number) => Math.max(-2, Math.min(2, v));

const basePositions: PartyPosition[] = Object.entries(PARTY_ROWS).flatMap(([partyId, rows]) =>
  rows.map((r) => ({
    questionId: r.q,
    partyId,
    value: clamp(r.v),
    citations: [{ label: r.l, url: r.u }],
    status: "draft" as const,
  })),
);

const basePositionByKey = new Map(basePositions.map((p) => [`${p.questionId}::${p.partyId}`, p]));
const variantPositions: PartyPosition[] = VARIANT_QDEFS.flatMap((q) =>
  Object.keys(PARTY_ROWS).map((partyId) => {
    const source = basePositionByKey.get(`${POSITION_SOURCE_BY_QUESTION.get(q.id)}::${partyId}`);
    if (!source) throw new Error(`Saknar basposition för variant ${q.id}/${partyId}`);
    return { ...source, questionId: q.id };
  }),
);

export const catalog2026Positions: PartyPosition[] = [...basePositions, ...variantPositions];
