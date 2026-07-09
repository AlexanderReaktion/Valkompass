/**
 * AI-RESEARCHAT UTKAST – frågebank (54 sakfrågegrupper, 74 formuleringar)
 * + partipositioner (592 inkl. varianter) inför
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

const PUBLIC_RATIONALE_BY_BASE_ID: Record<string, string> = {
  skatt_arbete: "Frågan fångar din syn på avvägningen mellan lägre skatt på arbete och intäkter till gemensamma åtaganden.",
  hoginkomstskatt: "Den visar hur du ser på om skattesystemet ska omfördela mer från höga inkomster eller om marginalskatterna ska hållas nere.",
  bolagsskatt: "Den fångar balansen mellan företagens villkor och skatteintäkter från vinster.",
  kapitalskatt: "Den visar hur du väger beskattning av kapitalinkomster mot sparande, investeringar och fördelning.",
  offentliga_utgifter: "Den handlar om hur stor roll det offentliga ska ha i välfärden när utbyggnad också kräver finansiering.",
  rutrot: "Den är med eftersom avdrag för hushållsnära tjänster delar synen på skattesubventioner, arbetsmarknad och fördelningspolitik.",
  vinst_valfard: "Den fångar om du tycker att privata utförare ska kunna ta ut vinst när verksamheten finansieras med skattemedel.",
  offentlig_ansvar: "Den visar hur du ser på vem som ska driva vård och skola: offentliga huvudmän eller fler privata utförare.",
  arbetsratt: "Den fångar avvägningen mellan flexibilitet för arbetsgivare och anställningstrygghet för arbetstagare.",
  akassa: "Den visar hur du väger ekonomisk trygghet vid arbetslöshet mot statens kostnader och arbetslinjens incitament.",
  forsorjningsstod: "Den handlar om var gränsen ska gå mellan ekonomiskt stöd till hushåll och krav på att bidragssystemen begränsas.",
  pension: "Den fångar hur högt du prioriterar höjda pensioner när de behöver finansieras med skatter eller avgifter.",
  vard_resurser: "Den visar hur du väger mer resurser till sjukvården mot ett högre skattetryck.",
  friskolor: "Den är med eftersom skolvalets urvalsregler påverkar både familjers valfrihet och likvärdigheten mellan elever.",
  vinst_skola: "Den fångar din syn på om skattefinansierad skola ska få dela ut vinst till ägare.",
  marknadshyror: "Den visar hur du ser på balansen mellan friare hyressättning i nyproduktion och skydd mot snabbare hyreshöjningar.",
  asyl_farre: "Den fångar din syn på hur restriktiv eller öppen asylpolitiken ska vara.",
  flykting_oppen: "Den kompletterar asylfrågan genom att fråga om kvotflyktingar, där staten i förväg väljer hur många som tas emot.",
  medborgarskap: "Den visar hur du ser på kraven för att bli svensk medborgare och balansen mellan inkludering och motprestationer.",
  medborgarskap_aterkallelse: "Den fångar gränsen mellan medborgarskapets skydd och statens möjlighet att agera vid mycket allvarlig brottslighet.",
  atervandring: "Den handlar om huruvida staten ska använda ekonomiska incitament för frivillig återvandring.",
  informationsplikt: "Den visar hur du väger migrationskontroll mot tillit till myndigheter och tillgång till samhällsservice.",
  anhorig: "Den fångar balansen mellan familjeåterförening och en mer restriktiv migrationspolitik.",
  straff: "Den visar hur du ser på hårdare straff som svar på grov brottslighet.",
  polisbefogenheter: "Den fångar avvägningen mellan effektiv brottsbekämpning och skyddet för personlig integritet.",
  visitationszoner: "Den handlar om huruvida polisen ska kunna visitera utan konkret misstanke i särskilt utsatta lägen.",
  ungdomsstraff: "Den visar var du drar gränsen för straffrättsligt ansvar för yngre personer vid de grövsta brotten.",
  narkotika_avkrim: "Den fångar synen på om eget bruk av narkotika främst ska mötas med straff eller med vård och skademinskning.",
  forebyggande: "Den visar hur du väger förebyggande sociala insatser mot mer repressiva åtgärder i kriminalpolitiken.",
  integritet: "Den fångar avvägningen mellan ny övervakningsteknik för polisen och rätten till privatliv i offentliga miljöer.",
  klimat_prioritet: "Den visar hur högt du prioriterar klimatomställning när åtgärderna kan innebära kostnader på kort sikt.",
  miljoskatter: "Den fångar synen på om flygresor ska beskattas för att minska klimatpåverkan eller om skatten bör hållas borta.",
  naturskydd: "Den visar hur du väger skydd av skog och natur mot möjligheten att bruka marken.",
  foraldraforsakring: "Den handlar om balansen mellan jämnare uttag av föräldraledighet och familjers frihet att själva fördela dagarna.",
  abort: "Den fångar var du drar gränsen mellan nuvarande abortregler och ytterligare begränsningar sent i graviditeten.",
  hbtqi: "Den visar hur du ser på juridiskt kön och balansen mellan enklare regler för individen och mer restriktiv lagstiftning.",
  eu_makt: "Den fångar din syn på hur mycket beslutanderätt Sverige ska dela med EU.",
  public_service: "Den handlar om public service-uppdragets omfattning och finansiering: mer resurser till oberoende medier eller en stramare nivå.",
  monarki: "Den visar hur du ser på Sveriges statsskick: ärvd monarki eller republik.",
  sjukvard_stat: "Den fångar frågan om sjukvårdens ansvar ska ligga kvar regionalt eller flyttas tydligare till staten.",
  tandvard_hogkostnad: "Den visar hur du väger lägre tandvårdskostnader för patienter mot statens kostnader för ett bredare skydd.",
  skola_forstatliga: "Den handlar om vem som ska ansvara för skolan: kommunerna eller staten.",
  bensinskatt: "Den fångar avvägningen mellan lägre drivmedelskostnader och skatteintäkter samt klimatstyrning.",
  bistand: "Den visar hur högt du prioriterar internationellt bistånd i relation till andra statliga utgifter.",
  arbetskraftsinvandring: "Den handlar om balansen mellan företags möjlighet att rekrytera utanför EU och krav på lönenivåer och arbetsvillkor.",
  karnkraft: "Den fångar synen på kärnkraftens roll i Sveriges framtida elförsörjning.",
  vindkraft: "Den visar hur du väger snabbare utbyggnad av vindkraft mot lokala intressen och annan energiplanering.",
  reduktionsplikt: "Den handlar om balansen mellan lägre drivmedelspris och krav som minskar utsläpp från bensin och diesel.",
  vargjakt: "Den fångar avvägningen mellan rovdjursskydd och intressen för jakt, djurhållning och människor som bor nära vargrevir.",
  strandskydd: "Den visar hur du väger mer byggande nära vatten mot allmänhetens tillgång till stränder och naturvärden.",
  nato: "Den fångar hur långt du vill att Sverige ska gå i sitt försvarssamarbete inom NATO efter medlemskapet.",
  forsvarsanslag: "Den visar hur högt du prioriterar ökade försvarsutgifter när pengarna behöver tas från lån, skatter eller andra områden.",
  euro: "Den fångar din syn på om Sverige ska behålla kronan eller gå vidare mot euron.",
  israel_sanktioner: "Den handlar om hur Sverige bör använda EU:s handelspolitik för att påverka Israel i en pågående konflikt.",
};

function publicRationaleFor(q: QDef): string {
  return PUBLIC_RATIONALE_BY_BASE_ID[q.positionSourceId ?? q.id] ?? q.rationale;
}

// OBS 2026-07 (frågerevisionen inför valet): 15 omankrade frågor fick ny text med ändrad
// betydelse. Deras positioner är ompositionerade källgrundat (research + adversariell
// motläsning) och inskrivna i positions2026/. Rader med svagt/gammalt/motstridigt belägg
// är märkta // TODO(expertgranskning) och ska dubbelkollas i /admin före slutgodkännande.
const QDEFS: QDef[] = [
  // Ekonomisk vänster–höger
  { id: "skatt_arbete", kind: "structural", dimension: "economic", polarity: 1, topic: "skatter", text: "Skatten på arbete bör sänkas.", rationale: "Klassisk fördelningspolitisk skiljelinje." },
  { id: "hoginkomstskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Höginkomsttagare bör betala mer i skatt.", rationale: "Omvänt formulerad; skiljer vänster/höger tydligt." },
  { id: "bolagsskatt", kind: "structural", dimension: "economic", polarity: 1, topic: "företag", text: "Bolagsskatten bör sänkas.", rationale: "Synen på företagande och skatt." },
  { id: "kapitalskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Skatten på kapitalinkomster bör höjas.", rationale: "Fördelning kapital vs arbete." },
  { id: "offentliga_utgifter", kind: "structural", dimension: "economic", polarity: -1, topic: "ekonomi", text: "Den offentliga välfärden bör byggas ut även om det kräver höjda skatter.", rationale: "Statens storlek. Ankarstam för kostnadsklausulen." },
  { id: "rutrot", kind: "dynamic", dimension: "economic", polarity: 1, topic: "skatter", text: "RUT-avdraget bör utökas.", rationale: "RUT och ROT har divergerat sedan 1 jan 2026 (RUT 50 %, ROT 30 %); RUT bär skiljelinjen renast: V vill avskaffa avdraget, S behålla utan utökning, högersidan har utökat." },
  { id: "vinst_valfard", kind: "structural", dimension: "economic", polarity: 1, topic: "välfärd", text: "Privata företag bör få göra vinst på skattefinansierad skola och vård.", rationale: "Vinster i välfärden – tydlig skiljelinje." },
  { id: "offentlig_ansvar", kind: "structural", dimension: "economic", polarity: -1, topic: "välfärd", text: "Antalet privat drivna verksamheter inom vård och skola bör begränsas till förmån för offentliga.", rationale: "Välfärdens organisering." },
  { id: "arbetsratt", kind: "structural", dimension: "economic", polarity: 1, topic: "arbetsmarknad", text: "Arbetsmarknaden bör avregleras så att det blir enklare att anställa och säga upp.", rationale: "Arbetsrätt – höger/vänster." },
  { id: "akassa", kind: "structural", dimension: "economic", polarity: -1, topic: "trygghet", text: "Ersättningsnivåerna i a-kassan bör höjas, även om det ökar statens utgifter.", rationale: "Ny arbetslöshetsförsäkring i kraft 1 okt 2025 (SFS 2024:506); höjningsfrågan är nu skiljelinjen: S/V/MP vill höja, M/KD/L/SD försvarar systemet, C vill ha tuffare a-kassa. Sjukförsäkringen är en egen strid och buntas inte. Polarity -1 sedan 2026-07 (instämmer = vänster); kanonisk riktning oförändrad." },
  { id: "forsorjningsstod", kind: "dynamic", dimension: "economic", polarity: 1, topic: "bidrag", text: "Bidragstaket, som sätter en övre gräns för ett hushålls samlade bidrag, bör behållas.", rationale: "Aktivitetskravet är redan beslutat (prop. 2025/26:207, i kraft 1 juli 2026); den kvarvarande skarpa striden är bidragstaket (prop. 2025/26:201, bet. 2025/26:SoU30, i kraft 1 jan 2027)." },
  { id: "pension", kind: "structural", dimension: "economic", polarity: -1, topic: "pension", text: "Pensionerna bör höjas, även om det betalas med höjda skatter eller avgifter.", rationale: "Pension vs skatt. Levande valfråga (S-utspel Almedalen juni 2026)." },
  { id: "vard_resurser", kind: "dynamic", dimension: "economic", polarity: -1, topic: "sjukvård", text: "Mer skattemedel bör tillföras sjukvården, även om skatten då blir högre.", rationale: "Salient: vårdens resurser." },
  { id: "friskolor", kind: "structural", dimension: "economic", polarity: 1, topic: "skola", text: "Friskolor bör även i fortsättningen kunna använda kötid som urvalsgrund vid antagningen.", rationale: "Kötid är den skarpaste mekanikstriden i skolvalet: slopandet föll i riksdagen 2022 (prop. 2021/22:158); bort med kötid: S, V, MP, C; behåll: M, KD, SD; L:s linje verifieras vid ompositionering." },
  { id: "vinst_skola", kind: "structural", dimension: "economic", polarity: 1, topic: "skola", text: "Vinstutdelning i friskolor bör tillåtas.", rationale: "Vinst i skolan. Baslinje: vinstutdelning fortfarande tillåten; prop. 2025/26:292 (värdeöverföringsförbud i vissa situationer) är ej beslutad." },
  { id: "marknadshyror", kind: "structural", dimension: "economic", polarity: 1, topic: "bostad", text: "Fri hyressättning bör tillåtas i nyproducerade hyreslägenheter (hyrorna i befintliga lägenheter berörs inte).", rationale: "Bostadspolitisk skiljelinje som delvis korsar blockgränsen: SD säger definitivt nej och C släppte kravet maj 2026 (C-positionen uppdateras); riksdagen har i stället beslutat en förbättrad presumtionshyresmodell (prop. 2024/25:192, i kraft 1 jan 2026)." },
  // Värderingar GAL–TAN
  { id: "asyl_farre", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Sverige bör ta emot färre asylsökande.", rationale: "Central GAL–TAN-fråga." },
  { id: "flykting_oppen", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Sverige bör ta emot fler kvotflyktingar.", rationale: "Motpol; varierad polaritet. Baslinje: kvoten är 900 per år sedan 2024; C och MP vill höja till 5 000." },
  { id: "medborgarskap", kind: "structural", dimension: "galtan", polarity: 1, topic: "integration", text: "De skärpta kraven för svenskt medborgarskap som infördes 2026 (bland annat åtta års hemvist och egen försörjning) bör behållas.", rationale: "Prop. 2025/26:175 är lag sedan 6 juni 2026; frågan gäller nu behåll eller riv upp (V och MP reserverade sig mot kärnförslagen, S och C mot delar)." },
  { id: "medborgarskap_aterkallelse", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "integration", text: "Svenskt medborgarskap bör kunna återkallas för personer med dubbelt medborgarskap som döms för allvarliga brott inom kriminella nätverk.", rationale: "Vilande grundlagsändring (prop. 2025/26:78, bet. 2025/26:KU34) som den nyvalda riksdagen ska bekräfta; terror och spioneri har bred majoritet medan nätverkskategorin delar partierna." },
  { id: "atervandring", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Bidraget på 350 000 kronor per vuxen till invandrare som frivilligt lämnar Sverige bör behållas.", rationale: "Den gamla utvisningsstammen låg nära valens; återvandringsbidraget (i kraft 1 jan 2026) är konkret och omstritt: M/SD/KD/L står bakom, S/V/MP/C är emot höjningen." },
  { id: "informationsplikt", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Den nya skyldigheten för statliga myndigheter att underrätta polisen om personer som saknar rätt att vistas i Sverige bör avskaffas.", rationale: "Beslutad 15 juni 2026 (prop. 2025/26:263, bet. 2025/26:SfU32), i kraft 13 juli 2026; vård, skola och socialtjänst är undantagna. Avskaffandefrågan skiljer V/MP från Tidöpartierna, med S och C i kritiska mellanlägen." },
  { id: "anhorig", kind: "structural", dimension: "galtan", polarity: 1, topic: "migration", text: "Möjligheten till anhöriginvandring bör begränsas.", rationale: "Anhöriginvandring. Prop. 2025/26:301 (juni 2026) behandlas av nästa riksdag; stammen beskriver ett levande förslag." },
  { id: "straff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Straffen för grova brott bör skärpas.", rationale: "Lag och ordning, salient. Baslinjenot: straffreformen (prop. 2025/26:218) i kraft 1 aug 2026 höjer baslinjen; stammen läses som framåtblickande preferens." },
  { id: "polisbefogenheter", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Polisen bör få utökade befogenheter att övervaka även personer som inte är konkret misstänkta.", rationale: "Befogenheter vs integritet. Baslinje: preventiva tvångsmedel utvidgade 1 okt 2023 och mot barn under 15 från 1 okt 2025; ytterligare utvidgning utreds (dir. 2026:20), så förslagsläsningen håller." },
  { id: "visitationszoner", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Polisen bör även i fortsättningen kunna inrätta säkerhetszoner (visitationszoner), där personer kan visiteras utan konkret brottsmisstanke.", rationale: "Lagen är i kraft sedan 25 april 2024 (SFS 2024:200) och permanent; frågan gäller nu behåll eller avskaffa, och kostnadssidan (visitation utan konkret misstanke) namnges i stammen." },
  { id: "ungdomsstraff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Straffbarhetsåldern bör sänkas från 15 till 14 år för de grövsta brotten.", rationale: "Fängelse för 15–17-åringar gäller redan sedan 1 juli 2026; det skarpa obeslutade förslaget är straffbarhetsålder 14 år (prop. 2025/26:293), som delar även regeringsblocket." },
  { id: "narkotika_avkrim", kind: "structural", dimension: "galtan", polarity: -1, topic: "brottslighet", text: "Eget bruk av narkotika bör avkriminaliseras.", rationale: "Klassisk GAL–TAN-markör med spridda lägen: V för, MP och C vill utvärdera, S-kongressen 2025 avslog, övriga emot; riksdagen avslog motioner våren 2026 (bet. 2025/26:SoU13)." },
  { id: "forebyggande", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "brottslighet", text: "Brottsbekämpning bör främst fokusera på förebyggande sociala insatser.", rationale: "Förebyggande vs repressivt." },
  { id: "integritet", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "integritet", text: "Polisens användning av ansiktsigenkänning i realtid på allmänna platser bör begränsas, även om det kan göra det svårare att utreda brott.", rationale: "Omankrad från kamera/avlyssning (redundant mot polisbefogenheter, item-H 1,00) till realtidsansiktsigenkänning (prop. 2025/26:150, i kraft 1 juli 2026); C röstade nej till lagen, V och MP reserverade sig, S/M/KD/L/SD stod bakom." },
  { id: "klimat_prioritet", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "klimat", text: "Klimatomställningen bör prioriteras även med högre kostnader på kort sikt.", rationale: "Värderingsdimension; tvåsidig stam." },
  { id: "miljoskatter", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "klimat", text: "Flygskatten bör återinföras.", rationale: "Flygskatten avskaffades 1 juli 2025, så en höjningsfråga hade falsk premiss; endast V och MP vill återinföra skatten, S gör det inte i sin budgetmotion för 2026." },
  { id: "naturskydd", kind: "structural", dimension: "galtan", polarity: -1, topic: "miljö", text: "Mer skog och natur bör skyddas även om det begränsar skogsbruk.", rationale: "Naturskydd vs brukande." },
  { id: "foraldraforsakring", kind: "structural", dimension: "galtan", polarity: -1, topic: "familj", text: "Fler dagar i föräldraförsäkringen bör öronmärkas så att de inte kan överlåtas mellan föräldrarna.", rationale: "Jämställdhet/familj. Baslinje: 90 reserverade dagar oförändrade; S/V/MP vill utöka öronmärkningen, SD/KD vill avskaffa den." },
  { id: "abort", kind: "structural", dimension: "galtan", polarity: 1, topic: "rättigheter", text: "Sena aborter (efter vecka 18) bör begränsas ytterligare.", rationale: "Värderingsmarkör; TAN-riktad proposition (polarity 1). Prop. 2025/26:271 behåller v18-gränsen och Rättsliga rådets tillstånd, så stammen är fortsatt korrekt mot baslinjen." },
  { id: "hbtqi", kind: "structural", dimension: "galtan", polarity: 1, topic: "rättigheter", text: "Den nya könstillhörighetslagen, som gör det enklare att ändra juridiskt kön, bör avskaffas.", rationale: "Lagen är i kraft sedan 1 juli 2025; SD och KD vill riva upp den, övriga partier står bakom. Polarity +1 sedan 2026-07 (instämmer = TAN); kanonisk riktning oförändrad: högre = TAN." },
  // Utanför kartaxlarna sedan strukturvalideringen 2026-07: EU-motstånd finns både till
  // vänster (V) och höger (SD), så frågan skalar dåligt på GAL–TAN (Loevingers H 0.11).
  // Den räknas fortfarande fullt ut i matchningen.
  { id: "eu_makt", kind: "structural", polarity: -1, topic: "EU", text: "Mer makt bör överföras från Sverige till EU.", rationale: "EU och suveränitet. Frågan ligger utanför kartans axlar eftersom EU-kritik finns i både vänster- och högerpartier; den räknas fullt ut i matchningen." },
  { id: "public_service", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "media", text: "Public service bör få större anslag än vad som är beslutat för perioden 2026-2033.", rationale: "Nytt PS-beslut i kraft 2 dec 2025 (prop. 2024/25:166); skiljelinjen är nu anslagsnivån: S/V/MP/C reserverade sig för mer pengar, M/KD/L/SD står bakom den beslutade nivån. Polarity -1 sedan 2026-07 (instämmer = GAL); kanonisk riktning oförändrad: högre = TAN/mindre PS." },
  { id: "monarki", kind: "structural", dimension: "galtan", polarity: -1, topic: "demokrati", text: "Monarkin bör avskaffas.", rationale: "Republik vs monarki." },
  // Energi / försvar / EU / vård / skola / miljö / utrikes (ingen kartaxel)
  // Spegelvänd visning (instämmer = behåll regionerna); kanoniskt värde oförändrat: högre = förstatliga.
  { id: "sjukvard_stat", kind: "dynamic", polarity: -1, topic: "sjukvård", text: "Regionerna bör även i fortsättningen ha huvudansvaret för sjukvården, i stället för att staten tar över.", rationale: "Vårdansvarskommittén (SOU 2025:62) avråder från statligt huvudmannaskap; endast KD och SD driver fullt förstatligande, M och S vill ha mer statlig styrning utan huvudmannaskapsbyte, V/MP/C/L är emot förstatligande." },
  // Spegelvänd visning (instämmer = inordna tandvården); kanoniskt värde: högre = emot inordning.
  { id: "tandvard_hogkostnad", kind: "dynamic", polarity: -1, topic: "sjukvård", text: "Tandvård bör ingå i samma högkostnadsskydd som övrig sjukvård, även om det kostar staten flera miljarder kronor om året.", rationale: "Tiotandvården för 67+ är i kraft 1 jan 2026 som uttalad etapp 1; full inordning för alla vuxna diskriminerar blocköverskridande (SD och V vill bygga ut mest, M historiskt enda nej-parti). Utanför kartans axlar: skalar sannolikt dåligt på economic." },
  // Spegelvänd visning (instämmer = behåll kommunerna); kanoniskt värde: högre = förstatliga.
  { id: "skola_forstatliga", kind: "structural", polarity: -1, topic: "skola", text: "Kommunerna bör även i fortsättningen ha huvudansvaret för skolan, i stället för att staten tar över.", rationale: "Speglar sjukvard_stat och korsar blocken: L, SD och V är för förstatligande, S/MP/C/M emot, KD mellanväg. Utanför kartans axlar (blockkorsande)." },
  { id: "bensinskatt", kind: "dynamic", polarity: 1, topic: "drivmedel", text: "Skatten på bensin och diesel bör sänkas.", rationale: "Aktuell prisfråga. Tillfälliga sänkningar 2026 (prop. 2025/26:236 och 275); permanent mot tillfälligt skiljer fortfarande." },
  // Spegelvänd visning (instämmer = återgå till enprocentsmålet); kanoniskt värde oförändrat: högre = emot återgång.
  { id: "bistand", kind: "dynamic", polarity: -1, topic: "bistånd", text: "Sverige bör återgå till målet att en procent av bruttonationalinkomsten går till bistånd.", rationale: "Enprocentsmålet övergavs 2022 och ramen är ca 0,74 % av BNI 2026; MP vill ha omedelbar återgång, V och C gradvis, S-ledningen utesluter återgång nästa mandatperiod." },
  { id: "arbetskraftsinvandring", kind: "dynamic", polarity: 1, topic: "arbetsmarknad", text: "Lönekravet på minst 90 procent av medianlönen för arbetstillstånd bör behållas.", rationale: "Skärpningen är lag sedan 1 juni 2026 (prop. 2025/26:87); behåll-framingen fångar striden: C vill skrota lönekravet, V och MP är emot lönegolvsmodellen, S är för restriktivitet med egen linje." },
  { id: "karnkraft", kind: "dynamic", polarity: 1, topic: "energi", text: "Kärnkraften i Sverige bör byggas ut.", rationale: "Energifråga. Finansieringslagen i kraft 1 aug 2025; S säger ja endast på befintliga platser (värdera S som +1 vid nästa granskning)." },
  { id: "vindkraft", kind: "dynamic", polarity: -1, topic: "energi", text: "Utbyggnaden av vindkraft bör gå snabbare än i dag.", rationale: "Energimix. Baslinje: 13 havsbaserade Östersjöprojekt avslogs nov 2024, vindkraftsersättning till närboende i kraft 1 juli 2026 (prop. 2025/26:239), kommunala vetot består; S/MP/V/C driver snabbare utbyggnad." },
  { id: "reduktionsplikt", kind: "dynamic", polarity: 1, topic: "drivmedel", text: "Reduktionsplikten för bensin och diesel bör sänkas.", rationale: "Klimat vs pris. Baslinje: 10 % för bensin och diesel sedan 1 juli 2025; sänkning läses relativt dagens nivå." },
  { id: "vargjakt", kind: "dynamic", polarity: -1, topic: "miljö", text: "Vargstammen bör tillåtas växa över dagens mål på 170 djur, även om angrepp på tamdjur då kan öka.", rationale: "Referensvärdet sänktes från 300 till 170 i juni 2025, men licensjakten 2026 stoppades av Förvaltningsrätten i Luleå; för minskad stam: M, SD, KD, C; emot: S, MP, V, L. Utanför kartans axlar (C på jaktsidan, L på skyddssidan)." },
  { id: "strandskydd", kind: "dynamic", polarity: 1, topic: "miljö", text: "Strandskyddet bör göras mindre strikt än i dag, så att det blir lättare att bygga nära vatten, även om allmänhetens tillgång till stränder minskar.", rationale: "Steg 1 är lag sedan 1 juli 2025 (prop. 2024/25:102) och steg 2 utreds skarpt (dir. 2025:59, slutbetänkande dec 2026); skiljer V/MP från Tidöpartierna och C, med S i mitten." },
  { id: "nato", kind: "dynamic", polarity: 1, topic: "försvar", text: "Sverige bör fördjupa sitt försvarssamarbete inom NATO.", rationale: "Försvarsfråga. Alla åtta partier accepterar medlemskapet; V vill säga upp DCA-avtalet och lagstifta mot kärnvapen, vilket dagens stam fångar." },
  { id: "forsvarsanslag", kind: "dynamic", polarity: 1, topic: "försvar", text: "Försvarsutgifterna bör öka till minst 3,5 procent av BNP, även om det kräver lån eller besparingar på andra områden.", rationale: "Efter Natos Haag-beslut 2025 (3,5 % kärnmilitärt plus 1,5 %) siktar regeringen på 3,5 % till 2030; en 3-procentströskel diskriminerar inte längre, 3,5 % med namngiven kostnad gör det." },
  { id: "euro", kind: "dynamic", polarity: 1, topic: "EU", text: "Sverige bör införa euron.", rationale: "Valutafråga. Sverigelöftet (L och SD, mars 2026) om euroutredning och folkomröstning 2030 håller frågan levande; M avvisade." },
  // PUBLICERINGSNOT (israel_sanktioner): instabil fråga (bräcklig vapenvila sedan 10 okt 2025;
  // rådsläget kan ändras). Verifiera 1–2 veckor före publicering att (a) handelsdelen i
  // associeringsavtalet fortfarande inte är suspenderad och (b) den svenska regeringslinjen
  // står kvar. Om läget vänt: uppdatera stammens tempus eller pausa frågan.
  { id: "israel_sanktioner", kind: "dynamic", polarity: -1, topic: "utrikespolitik", text: "Sverige bör driva på för att EU fryser handelsdelen i associeringsavtalet med Israel.", rationale: "Levande och oavgjort i juli 2026: kommissionen föreslog suspension i sep 2025 men kvalificerad majoritet saknas i rådet; regeringen krävde frysning medan SD kallade det haveri och KD ville ompröva, en skiljelinje rakt genom regeringsunderlaget." },
  // Ingen fråga om Ukrainastödet: samtliga åtta riksdagspartier står bakom det militära
  // stödet (stödpaket 22, Gripen-donationen, behandlades i bet. 2025/26:FöU17 utan
  // reservation mot stödet i sak; V:s reservationer gällde inriktning och USA-beroende,
  // SD är part i ramöverenskommelsen om 40 mdkr/år 2026-2027). Spridningen är ~0 och
  // frågan ger ingen särskiljande matchningssignal (verifierad juli 2026). Omprövas om
  // enigheten spricker.
];

const VARIANT_QDEFS: QDef[] = [
  { id: "skatt_arbete_alt", positionSourceId: "skatt_arbete", kind: "structural", dimension: "economic", polarity: 1, topic: "skatter", text: "Inkomstskatten för löntagare bör bli lägre.", rationale: "Alternativ neutral formulering av arbetsbeskattning." },
  { id: "hoginkomstskatt_alt", positionSourceId: "hoginkomstskatt", kind: "structural", dimension: "economic", polarity: -1, topic: "skatter", text: "Skattesystemet bör omfördela mer från höga inkomster.", rationale: "Alternativ formulering av progressiv beskattning." },
  { id: "offentliga_utgifter_alt", positionSourceId: "offentliga_utgifter", kind: "structural", dimension: "economic", polarity: -1, topic: "ekonomi", text: "Staten bör finansiera mer välfärd även om skattetrycket ökar.", rationale: "Alternativ formulering av statens storlek och finansiering." },
  { id: "vinst_valfard_alt", positionSourceId: "vinst_valfard", kind: "structural", dimension: "economic", polarity: 1, topic: "välfärd", text: "Skattefinansierad vård och skola bör kunna drivas med vinst.", rationale: "Alternativ formulering av vinstfrågan." },
  { id: "arbetsratt_alt", positionSourceId: "arbetsratt", kind: "structural", dimension: "economic", polarity: 1, topic: "arbetsmarknad", text: "Reglerna på arbetsmarknaden bör göra det lättare för arbetsgivare att säga upp personal.", rationale: "Alternativ formulering av arbetsrättens flexibilitet." },
  { id: "marknadshyror_alt", positionSourceId: "marknadshyror", kind: "structural", dimension: "economic", polarity: 1, topic: "bostad", text: "Nybyggda hyresrätter bör kunna hyras ut med fri hyressättning, medan dagens hyresreglering behålls för befintliga lägenheter.", rationale: "Alternativ formulering av fri hyressättning i nyproduktion." },
  { id: "asyl_farre_alt", positionSourceId: "asyl_farre", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "migration", text: "Asylmottagandet bör vara mer restriktivt än i dag.", rationale: "Alternativ formulering av restriktiv asylpolitik." },
  { id: "flykting_oppen_alt", positionSourceId: "flykting_oppen", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "migration", text: "Antalet kvotflyktingar som Sverige tar emot bör öka.", rationale: "Alternativ formulering av öppen flyktingpolitik." },
  { id: "straff_alt", positionSourceId: "straff", kind: "dynamic", dimension: "galtan", polarity: 1, topic: "brottslighet", text: "Längre fängelsestraff bör användas oftare vid grov brottslighet.", rationale: "Alternativ formulering av straffskärpningar." },
  { id: "forebyggande_alt", positionSourceId: "forebyggande", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "brottslighet", text: "Sociala förebyggande insatser bör prioriteras framför fler straffskärpningar.", rationale: "Alternativ formulering av förebyggande kriminalpolitik." },
  { id: "klimat_prioritet_alt", positionSourceId: "klimat_prioritet", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "klimat", text: "Klimatåtgärder bör genomföras även om de blir märkbara för hushåll och företag.", rationale: "Alternativ formulering av klimatets kostnadsavvägning." },
  { id: "abort_alt", positionSourceId: "abort", kind: "structural", dimension: "galtan", polarity: 1, topic: "rättigheter", text: "Möjligheten till abort efter vecka 18 bör snävas in jämfört med i dag.", rationale: "Alternativ formulering av frågan om sena aborter." },
  { id: "hbtqi_alt", positionSourceId: "hbtqi", kind: "structural", dimension: "galtan", polarity: 1, topic: "rättigheter", text: "Reglerna för att ändra juridiskt kön bör återgå till dem som gällde före den 1 juli 2025.", rationale: "Alternativ formulering av upprivningsfrågan om könstillhörighetslagen." },
  { id: "public_service_alt", positionSourceId: "public_service", kind: "dynamic", dimension: "galtan", polarity: -1, topic: "media", text: "Anslagen till SVT, SR och UR bör höjas utöver den redan beslutade nivån.", rationale: "Alternativ formulering av anslagsfrågan för public service; följer den omankrade basfrågan (polarity -1 sedan 2026-07)." },
  { id: "karnkraft_alt", positionSourceId: "karnkraft", kind: "dynamic", polarity: 1, topic: "energi", text: "Ny kärnkraft bör byggas i Sverige.", rationale: "Alternativ formulering av kärnkraftsutbyggnad." },
  { id: "vindkraft_alt", positionSourceId: "vindkraft", kind: "dynamic", polarity: -1, topic: "energi", text: "Utbyggnaden av vindkraft bör påskyndas.", rationale: "Alternativ formulering av vindkraftsutbyggnad (f.d. bastext, roterad 2026-07)." },
  { id: "sjukvard_stat_alt", positionSourceId: "sjukvard_stat", kind: "dynamic", polarity: -1, topic: "sjukvård", text: "Sjukvården bör även i fortsättningen drivas av regionerna i stället för att förstatligas.", rationale: "Alternativ formulering av huvudmannaskapsfrågan; spegelvänd visning som basfrågan." },
  { id: "bistand_alt", positionSourceId: "bistand", kind: "dynamic", polarity: -1, topic: "bistånd", text: "Enprocentsmålet för biståndet bör återinföras.", rationale: "Alternativ formulering av enprocentsmålet; spegelvänd visning som basfrågan." },
  { id: "nato_alt", positionSourceId: "nato", kind: "dynamic", polarity: 1, topic: "försvar", text: "Sverige bör knyta sitt försvar ännu närmare NATO.", rationale: "Alternativ formulering av fördjupat NATO-samarbete." },
  { id: "eu_makt_alt", positionSourceId: "eu_makt", kind: "structural", polarity: -1, topic: "EU", text: "Fler beslut bör fattas gemensamt inom EU även om Sverige lämnar över mer makt.", rationale: "Alternativ formulering av EU-integration. Utanför kartans axlar av samma skäl som grundfrågan." },
];

// Invariant för equivalenceKey (src/kompass/testPlan.ts): variant-strippningen
// matchar /_alt\d*$/. Ett BAS-id som självt slutar på "_alt" skulle kollapsas till
// en icke-existerande grupp, och varje variant måste peka på en basfråga via
// positionSourceId. Fångas vid modulladdning (även i tester) så att en framtida
// namngivning inte tyst bryter varianthanteringen.
const ALT_SUFFIX = /_alt\d*$/;
for (const d of QDEFS) {
  if (ALT_SUFFIX.test(d.id)) {
    throw new Error(`Basfråge-id får inte sluta på "_alt": ${d.id} (krockar med equivalenceKey).`);
  }
}
for (const d of VARIANT_QDEFS) {
  if (!ALT_SUFFIX.test(d.id)) throw new Error(`Variant-id måste sluta på "_alt": ${d.id}.`);
  if (!d.positionSourceId) throw new Error(`Variant ${d.id} saknar positionSourceId.`);
}

const ALL_QDEFS = [...QDEFS, ...VARIANT_QDEFS];
const POSITION_SOURCE_BY_QUESTION = new Map(
  VARIANT_QDEFS.map((q) => [q.id, q.positionSourceId ?? q.id] as const),
);

export const catalog2026Questions: CatalogQuestion[] = ALL_QDEFS.map((d) =>
  createQuestion(
    { id: d.id, kind: d.kind, polarity: d.polarity, topic: d.topic, text: d.text, rationale: publicRationaleFor(d), ...(d.dimension ? { dimension: d.dimension } : {}) },
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
