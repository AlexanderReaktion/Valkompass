import type { PositionRow } from "./types.ts";

const rows: PositionRow[] = [
  { q: "skatt_arbete", v: 2, l: "M: sänka skatt på arbete, femte jobbskatteavdraget förbereds", u: "https://moderaterna.se/var-politik/skatter/" },
  { q: "hoginkomstskatt", v: 2, l: "Moderaterna sänker skatten mest för höginkomsttagare via sänkt statlig inkomstskatt", u: "https://www.svt.se/nyheter/inrikes/moderaterna-sanker-skatten-mest-for-hoginkomsttagare" },
  { q: "bolagsskatt", v: 2, l: "M vill sänka bolagsskatten, på sikt till en av de lägsta i EU", u: "https://moderaterna.se/var-politik/skatter/" },
  { q: "kapitalskatt", v: 2, l: "M säger nej till förmögenhetsskatt och vill sänka skatt på sparande (ISK)", u: "https://moderaterna.se/nyhet/vallofte-sankt-skatt-pa-sparande/" },
  { q: "offentliga_utgifter", v: 2, l: "M:s valmanifest rymmer skattesänkningar på ca 35 mdkr, nej till skattehöjningar", u: "https://moderaterna.se/var-politik/skatter/" },
  { q: "bensinskatt", v: 2, l: "M vill sänka drivmedelsskatten och hålla nere bränslepriserna", u: "https://moderaterna.se/var-politik/klimat-miljo-och-energi/" },
  { q: "rutrot", v: 2, l: "Serviceföretagen (dec 2025), näringspolitisk årskrönika: 'Moderaterna vill höja rut-avdraget och bredda tillämpningsområdena'", u: "https://www.serviceforetagen.se/2025/12/29/vad-hande-naringspolitiskt-2025/" },
  { q: "bistand", v: 2, l: "Regeringen (M-ledd): justerad biståndsram från 2026 (ca 0,74 % BNI); Kristersson föreslår europeiskt snitt", u: "https://www.regeringen.se/pressmeddelanden/2024/09/regeringen-justerar-bistandsramen-fran-2026/" },
  { q: "vinst_valfard", v: 2, l: "Kristersson: begränsade vinster i välfärden hotar valfriheten", u: "https://moderaterna.se/app/uploads/2025/03/Remissversion-av-handlingsprogram.pdf" },
  { q: "offentlig_ansvar", v: 2, l: "Moderaterna: Hälso- och sjukvård", u: "https://moderaterna.se/var-politik/halso-och-sjukvard-2/" },
  { q: "arbetsratt", v: 2, l: "M vill reformera LAS så kompetens väger tyngre än anställningstid i turordningen", u: "https://moderaterna.se/var-politik/arbetslinjen/" },
  { q: "akassa", v: 2, l: "M: Ansträngning ska löna sig (bidragstak och aktivitetskrav)", u: "https://moderaterna.se/nyhet/anstrangning-ska-lona-sig-forslag-om-bidragstak-och-aktivitetskrav/" },
  { q: "forsorjningsstod", v: 2, l: "M: \"Ansträngning ska löna sig\" - förslag om bidragstak och aktivitetskrav (moderaterna.se); ingen M-reservation i SoU30", u: "https://moderaterna.se/nyhet/anstrangning-ska-lona-sig-forslag-om-bidragstak-och-aktivitetskrav/" },
  { q: "pension", v: 1, l: "M/SD/KD/L överens om kraftigt höjda pensioner (finansieras via tax cuts + överskott, ej höjda avgifter)", u: "https://moderaterna.se/nyhet/m-sd-kd-och-l-ar-overens-om-kraftigt-hojda-pensioner/" },
  { q: "arbetskraftsinvandring", v: 2, l: "Moderaterna, Migration (var-politik/migration); röstning bet. 2025/26:SfU12 (M röstade ja, 60-0)", u: "https://moderaterna.se/var-politik/migration/" },
  { q: "asyl_farre", v: 2, l: "M vill minska asylinvandringen till EU:s miniminivå", u: "https://moderaterna.se/var-politik/migration/" },
  { q: "flykting_oppen", v: 2, l: "SVT: Hård debatt mellan C och M om antalet kvotflyktingar", u: "https://www.svt.se/nyheter/inrikes/hard-debatt-mellan-c-och-m-om-antalet-kvotflyktingar" },
  { q: "medborgarskap", v: 2, l: "Bet. 2025/26:SfU28, slutvotering (M 57 Ja/0 Nej); M-ledd regering lade fram prop. 2025/26:175", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/skarpta-krav-for-svenskt-medborgarskap_hd01sfu28/html/" },
  { q: "atervandring", v: 2, l: "Migrationsminister Johan Forssell (M): 'Frivillig återvandring skapar möjligheter till nystart och kan leda till ekonomisk tillväxt i ett annat land'", u: "https://www.regeringen.se/pressmeddelanden/2025/04/ett-kraftigt-hojt-atervandringsbidrag/" },
  { q: "anhorig", v: 2, l: "M vill begränsa anhöriginvandringen och skärpa försörjningskrav", u: "https://moderaterna.se/var-politik/migration/" },
  { q: "straff", v: 2, l: "M vill skärpa straffen för grova brott, bl.a. dubblade straff för gängbrott", u: "https://moderaterna.se/var-politik/lag-och-ordning-2/" },
  { q: "polisbefogenheter", v: 2, l: "Betänkande 2023/24:JuU24 (M driver forslaget)", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/preventiva-tvangsmedel-for-att-forebygga-och_hb01juu24/" },
  { q: "visitationszoner", v: 2, l: "Moderaterna: Lag och ordning", u: "https://moderaterna.se/var-politik/lag-och-ordning-2/" },
  { q: "ungdomsstraff", v: 2, l: "Regeringen (M-ledd): straffbarhetsåldern sänks till 14 år för allvarliga brott, juli 2026", u: "https://www.regeringen.se/pressmeddelanden/2026/07/regeringen-foreslar-skarpta-regler-for-unga-lagovertradare-och-att-straffbarhetsaldern-sanks-till-14-ar/" },
  { q: "forebyggande", v: 1, l: "M betonar repressiv linje med hårdare straff och fler befogenheter mot gängbrott", u: "https://moderaterna.se/var-politik/lag-och-ordning-2/" },
  { q: "integritet", v: 2, l: "Debattartikel på regeringen.se (mars 2026): 'Vi ger polisen möjlighet att använda AI i realtid', av justitieminister Gunnar Strömmer (M) med Slottner (KD) och Melin (L); JuU28 utan reservation", u: "https://www.regeringen.se/debattartiklar/2026/03/vi-ger-polisen-mojlighet-att-anvanda-ai-i-realtid/" },
  { q: "klimat_prioritet", v: 1, l: "M vill att klimatpolitikens samlade kostnader hålls så låga som möjligt", u: "https://moderaterna.se/var-politik/klimat-miljo-och-energi/" },
  { q: "karnkraft", v: 2, l: "Moderaterna – Plan för framtidens kärnkraft", u: "https://moderaterna.se/nyhet/byggnykarnkraft/" },
  { q: "vindkraft", v: 1, l: "M vill inte subventionera vindkraft och ger kommuner veto mot utbyggnad", u: "https://moderaterna.se/var-politik/klimat-miljo-och-energi/" },
  { q: "miljoskatter", v: 2, l: "Moderaterna (Maria Stockhaus och Oskar Svärd, M), Altinget 22 maj 2024: \"Vi var emot den då och med remitteringen tas första steget för att ha möjlighet att avskaffa skatten\"; flygskatten avskaffades helt 1 juli 2025 under M-lett styre", u: "https://www.altinget.se/artikel/m-nu-tar-regeringen-forsta-steget-mot-sankt-flygskatt" },
  { q: "reduktionsplikt", v: 2, l: "M vill sänka reduktionsplikten till EU:s miniminivå för lägre bränslepriser", u: "https://moderaterna.se/var-politik/klimat-miljo-och-energi/" },
  { q: "naturskydd", v: 1, l: "SVT Valkompass 2026: Moderaterna (skog – 'Lite mindre')", u: "https://valkompass.svt.se/2026/parti/moderaterna/" },
  { q: "vard_resurser", v: 1, l: "M betonar effektivare resursanvändning i vården framför skattehöjningar", u: "https://moderaterna.se/app/uploads/2025/03/Remissversion-av-handlingsprogram.pdf" },
  { q: "friskolor", v: 2, l: "Vi Lärare: 22 heta valfrågor för skolan, partienkät (24 sep 2025), fråga 15", u: "https://www.vilarare.se/nyheter/skolpolitik/22-heta-valfragor-for-skolan--sa-svarar-partierna/" },
  { q: "vinst_skola", v: 2, l: "M ser ingen anledning att begränsa eller stoppa vinstutdelning från friskolor", u: "https://www.vilarare.se/nyheter/friskolor/sa-sager-partierna-om-friskolor/" },
  { q: "foraldraforsakring", v: 1, l: "Moderaterna driver valfrihet i föräldraförsäkringen", u: "https://moderaterna.se/nyhet/moderaterna-driver-valfrihet-i-foraldraforsakringen/" },
  // Expertgranskning: M står bakom dagens abortlagstiftning och driver inga ytterligare begränsningar av sena aborter → svagt emot skärpning.
  { q: "abort", v: -1, l: "Människovärde – Vad anser partierna om abort? (M värnar nuvarande lagstiftning)", u: "https://manniskovarde.se/vad-anser-politiska-partier-om-abort/" },
  { q: "hbtqi", v: -1, l: "SVT: Moderaterna vill se över könstillhörighetslagen", u: "https://www.svt.se/nyheter/inrikes/moderaterna-vill-se-over-konstillhorighetslagen" },
  { q: "nato", v: 2, l: "M vill att Sverige blir en aktiv Natomedlem och fördjupar försvarssamarbetet", u: "https://moderaterna.se/nyhet/aktivmedleminato/" },
  { q: "forsvarsanslag", v: 2, l: "M: Försvar och krisberedskap (Natos mål 3,5 % militärt till 2030, lånefinansierat)", u: "https://moderaterna.se/var-politik/forsvar-och-krisberedskap/" },
  { q: "eu_makt", v: 1, l: "Moderaterna – EU", u: "https://moderaterna.se/var-politik/eu/" },
  { q: "euro", v: 0, l: "SVT: Finansministern öppnar upp för euron", u: "https://www.svt.se/nyheter/inrikes/finansminister-sakerhetslaget-oppnar-upp-for-euron" },
  { q: "public_service", v: 1, l: "Regeringen.se, pressmeddelande om beslutad proposition (citat kulturminister Parisa Liljestrand, M)", u: "https://www.regeringen.se/pressmeddelanden/2025/05/proposition-om-public-service-20262033-beslutad/" }, // TODO(expertgranskning): Den ursprungligen citerade SVT-artikeln ('mindre pengar och smalare utbud') gäller ett M-stämmobeslu
  { q: "monarki", v: 2, l: "M vill bevara monarkin som enande kraft över partipolitiken", u: "https://www.republikanskaforeningen.se/opinion/vad-tycker-partierna-om-republik/" },
  // 2026-07: nya frågor (bostad + sjukvårdens huvudmannaskap)
  { q: "marknadshyror", v: 2, l: "Fastighetstidningen: Partiernas syn på friare hyror (M för fri hyressättning i nyproduktion; befintligt bestånd hålls utanför)", u: "https://fastighetstidningen.se/nyhet/partiernas-syn-pa-friare-hyror/" },
  { q: "sjukvard_stat", v: -1, l: "SVT: 6 av 8 partier vill inte att staten tar över sjukvården (M pekar på risker och kostnader med förstatligande)", u: "https://www.svt.se/nyheter/inrikes/svt-erfar-partierna-splittrade-om-statlig-sjukvard" },
  { q: "medborgarskap_aterkallelse", v: 2, l: "KU34: M röstade för grundlagsändringen utan reservation", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/en-grundlagsskyddad-abortratt-samt-utokade_hd01ku34/" },
  { q: "tandvard_hogkostnad", v: 2, l: "Tandläkartidningen 2026: M vill inte bygga ut tandvårdsstödet innan reformen är utvärderad (Ragnarsson)", u: "https://www.tandlakartidningen.se/nyhet/m-bygg-inte-ut-tandvardsstodet-innan-reformen-ar-utvarderad/" }, // TODO(expertgranskning): RÄTTAT från +1 till +2, källan bytt. Den ursprungliga JSON-källan (tandvarden-en-allt-storre-valfrag
  { q: "narkotika_avkrim", v: 2, l: "Bet. 2025/26:SoU13 (beslut 22 jan 2026): utskottsmajoriteten, inklusive M, avslog avkriminaliseringsyrkandena", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/alkohol-narkotika-dopning-tobak-och-spel_hd01sou13/html/" },
  { q: "skola_forstatliga", v: -1, l: "Vi Lärare: 22 heta valfrågor för skolan - M svarar 'Nej, men ökad statlig styrning'", u: "https://www.vilarare.se/nyheter/skolpolitik/22-heta-valfragor-for-skolan--sa-svarar-partierna/" },
  { q: "informationsplikt", v: 2, l: "Bet. 2025/26:SfU32 (prop. 2025/26:263, M-ledd regering)", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/starkt-atervandandeverksamhet_hd01sfu32/" },
  { q: "vargjakt", v: 2, l: "Moderaterna: Gröna näringar, landsbygd och jakt", u: "https://moderaterna.se/var-politik/grona-naringar-landsbygd-och-jakt/" },
  { q: "strandskydd", v: 2, l: "M: Det ska vara enkelt att bygga och bo nära vatten (vallöfte juni 2026)", u: "https://moderaterna.se/nyhet/det-ska-vara-enkelt-att-bygga-och-bo-nara-vatten/" }, // TODO(expertgranskning): M:s egen sida och en egen riksdagsmotion (2025/26:1275, Malmqvist m.fl., 'Avskaffande av strandskydd
  { q: "israel_sanktioner", v: -1, l: "SVT: Regeringen (Kristersson, M) vill frysa handelsavtalet med Israel", u: "https://www.svt.se/nyheter/utrikes/regeringen-vill-stoppa-handeln-med-israel" }, // TODO(expertgranskning): Utrikesminister Stenergard (M) drev kravet på frysning från aug 2025 och höll fast vid det åtminston
];

export default rows;
