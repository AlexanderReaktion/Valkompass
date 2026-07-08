import type { PositionRow } from "./types.ts";

const rows: PositionRow[] = [
  { q: "skatt_arbete", v: 2, l: "KD: Lägre skatter på arbete och pension", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "hoginkomstskatt", v: 2, l: "KD har drivit på för höjd brytpunkt för statlig inkomstskatt", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "bolagsskatt", v: 1, l: "KD: konkurrenskraftiga företagsskatter och lägre regelbörda", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "kapitalskatt", v: 2, l: "KD vill sänka skatt på arbete och ägande, motsätter sig förmögenhetsskatt", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "offentliga_utgifter", v: 2, l: "KD föreslår kommunal skattebroms och god hushållning", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "bensinskatt", v: 2, l: "KD vill sänka bränslepriserna bl.a. via sänkt reduktionsplikt", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/energi" },
  { q: "rutrot", v: 0, l: "KD A till Ö: ROT- och RUT-avdrag - rent deskriptiv text, inget konkret utökningskrav hittat", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/rot--och-rut-avdrag" }, // TODO(expertgranskning): NEDJUSTERAD från prior +1 till 0. Sidan är uteslutande deskriptiv (beskriver att avdragen minskat sv
  { q: "bistand", v: -1, l: "KD politik A-Ö: bistånd och utvecklingssamarbete", u: "https://kristdemokraterna.se/politik-a-o/bistand-och-utvecklingssamarbete/" }, // TODO(expertgranskning): Bekräftat men svagt och motstridigt. KD:s partisida säger otvetydigt: 'Kristdemokraterna stödjer mål
  { q: "vinst_valfard", v: 2, l: "KD: Nej till förbud mot vinster i välfärden", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/vinster-i-valfarden" },
  { q: "offentlig_ansvar", v: 2, l: "Kristdemokraterna: Valfrihet", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/valfrihet" },
  { q: "arbetsratt", v: 1, l: "KD vill underlätta för företag att anställa och minska regelbördan", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "akassa", v: 1, l: "KD A till Ö: A-kassa", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/a-kassa" },
  { q: "forsorjningsstod", v: 2, l: "SoU30: KD i regeringsunderlaget, ingen reservation; socialminister Forssmed (KD) huvudansvarig för propositionen", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/reformerat-forsorjningsstod-bidragstak-och-okade_hd01sou30/" },
  { q: "pension", v: 1, l: "KD prioriterar sänkt skatt på pension framför höjda skatter", u: "https://kristdemokraterna.se/var-politik/politikomraden/ekonomi--skatter" },
  { q: "arbetskraftsinvandring", v: 2, l: "Kristdemokraterna, A till Ö: Arbetskraftsinvandring", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/arbetskraftsinvandring" },
  { q: "asyl_farre", v: 2, l: "KD vill ha en stram och hållbar migrationspolitik med färre asylsökande", u: "https://kristdemokraterna.se/var-politik/politikomraden/migration-och-integration" },
  { q: "flykting_oppen", v: 1, l: "Kristdemokraterna: Migration och integration / Flyktingar", u: "https://kristdemokraterna.se/var-politik/politikomraden/migration-och-integration" },
  { q: "medborgarskap", v: 2, l: "KD A till Ö: Medborgarskap; slutvotering 16 Ja/0 Nej", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/medborgarskap" },
  { q: "atervandring", v: 2, l: "Regeringen: Ett kraftigt höjt återvandringsbidrag; KD:s migrationspolitiske talesperson Ingemar Kihlström", u: "https://www.regeringen.se/pressmeddelanden/2025/04/ett-kraftigt-hojt-atervandringsbidrag/" },
  { q: "anhorig", v: 1, l: "Regeringen – Nya regler för anhöriginvandring (juni 2026), KD stöder höjt försörjningskrav", u: "https://www.regeringen.se/pressmeddelanden/2026/06/nya-regler-for-anhoriginvandring/" },
  { q: "straff", v: 2, l: "KD vill skärpa straffen och avskaffa mängdrabatten", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/brottsbekampning" },
  { q: "polisbefogenheter", v: 2, l: "Betänkande 2023/24:JuU24 (KD bakom forslaget)", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/preventiva-tvangsmedel-for-att-forebygga-och_hb01juu24/" },
  { q: "visitationszoner", v: 2, l: "Kristdemokraterna: Polisen (A till Ö)", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/polisen" },
  { q: "ungdomsstraff", v: 2, l: "Regeringen: Regeringen föreslår skärpta regler för unga lagöverträdare och att straffbarhetsåldern sänks till 14 år", u: "https://www.regeringen.se/pressmeddelanden/2026/07/regeringen-foreslar-skarpta-regler-for-unga-lagovertradare-och-att-straffbarhetsaldern-sanks-till-14-ar/" },
  { q: "forebyggande", v: 1, l: "KD betonar lag och ordning och hårdare repressiva åtgärder mot gäng", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/brottsbekampning" },
  { q: "integritet", v: 2, l: "Debattartikel på regeringen.se (mars 2026) av civilminister Erik Slottner (KD) tillsammans med justitieminister Strömmer (M) och Martin Melin (L); JuU28: KD i den reservationsfria majoriteten", u: "https://www.regeringen.se/debattartiklar/2026/03/vi-ger-polisen-mojlighet-att-anvanda-ai-i-realtid/" },
  { q: "klimat_prioritet", v: 1, l: "KD betonar kostnadseffektiv klimatpolitik och elsystem framför kortsiktiga kostnader", u: "https://kristdemokraterna.se/var-politik/politikomraden/miljo--energi" },
  { q: "karnkraft", v: 2, l: "Kristdemokraterna – Kärnkraft (politik A–Ö)", u: "https://kristdemokraterna.se/politik-a-o/karnkraft/" },
  { q: "vindkraft", v: 1, l: "KD vill bevara det kommunala vetot mot vindkraft", u: "https://kristdemokraterna.se/var-politik/politikomraden/miljo--energi" },
  { q: "miljoskatter", v: 2, l: "Regeringen (infrastrukturminister Andreas Carlson, KD), debattartikel 25 juni 2026: varnar för en \"återinförd - och fördubblad - flygskatt\" om Miljöpartiet fick bestämma över luftfarten", u: "https://www.regeringen.se/debattartiklar/2026/06/det-ar-slut-pa-flygfientlig-politik/" },
  { q: "reduktionsplikt", v: 2, l: "KD vill sänka reduktionsplikten för lägre bränslepriser", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/energi" },
  { q: "naturskydd", v: 1, l: "KD värnar äganderätten i skogen mot hotande inskränkningar", u: "https://kristdemokraterna.se/var-politik/politikomraden/jord--skogsbruk" },
  { q: "vard_resurser", v: 1, l: "Dagens Arena 'Så vill partierna förbättra sjukvården' + kristdemokraterna.se: KD – mer resurser kan fås utan att höja skatter, vill istället att staten tar över ansvaret", u: "https://www.dagensarena.se/innehall/sa-vill-partierna-forbattra-sjukvarden/" },
  { q: "friskolor", v: 2, l: "Vi Lärare: 22 heta valfrågor för skolan, partienkät (24 sep 2025), fråga 15", u: "https://www.vilarare.se/nyheter/skolpolitik/22-heta-valfragor-for-skolan--sa-svarar-partierna/" }, // TODO(expertgranskning): KÄLLFEL UPPTÄCKT I URSPRUNGSRADEN: Altinget-artikeln 'KD: Rucka inte på rätten att välja skola' är f
  { q: "vinst_skola", v: 2, l: "KD anser att vinstutdelning är acceptabel om skolan håller kvalitet", u: "https://www.vilarare.se/nyheter/politik/kristdemokraterna-nej-till-forbud-mot-vinster/" },
  { q: "foraldraforsakring", v: 2, l: "Kristdemokraterna – Föräldraförsäkring (politik A-Ö)", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/foraldraforsakring" },
  { q: "abort", v: 1, l: "Kristdemokraterna – Abort (politik A-Ö): står bakom lagen men betonar etiska avvägningar kring sena aborter", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/abort" },
  { q: "hbtqi", v: 2, l: "Riksdagen: Motion 2025/26:3463 Könstillhörighetslagen (Christian Carlsson m.fl., KD)", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/motion/konstillhorighetslagen_hd023463/" },
  { q: "nato", v: 2, l: "KD ser Nato som främsta garanten för Europas försvar och vill fördjupa samarbetet", u: "https://kristdemokraterna.se/var-politik/politikomraden/forsvar" },
  { q: "forsvarsanslag", v: 2, l: "Kristdemokraterna, politikområde Försvar (uppdaterad 27 april 2026)", u: "https://kristdemokraterna.se/var-politik/politikomraden/forsvar" },
  { q: "eu_makt", v: 1, l: "KD betonar subsidiaritet och att Nato inte EU ska vara främsta försvarsgaranten", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/sakerhetspolitik" },
  { q: "euro", v: -1, l: "KD: euroanslutning är inte aktuell, folkomröstningen 2003 ska respekteras", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/emu-och-euron" },
  { q: "public_service", v: 1, l: "Regeringen.se, pressmeddelande om beslutad proposition (citat Roland Utbult, KD)", u: "https://www.regeringen.se/pressmeddelanden/2025/05/proposition-om-public-service-20262033-beslutad/" }, // TODO(expertgranskning): KÄLLBYTE: den ursprungligen angivna radionytt.se-artikeln innehöll vid kontroll inte det åberopade U
  { q: "monarki", v: 2, l: "KD vill bevara monarkin som en viktig symbol för Sverige", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/monarki" },
  // 2026-07: nya frågor (bostad + sjukvårdens huvudmannaskap)
  { q: "marknadshyror", v: 1, l: "Fastighetstidningen: Partiernas syn på friare hyror (KD: hyressättningen i nyproduktion behöver bli mer flexibel och spegla efterfrågan)", u: "https://fastighetstidningen.se/nyhet/partiernas-syn-pa-friare-hyror/" },
  { q: "sjukvard_stat", v: 2, l: "Altinget: KD trotsar kring vårdens förstatligande (KD vill att staten tar över huvudmannaskapet helt)", u: "https://www.altinget.se/artikel/kd-trotsar-kring-vaardens-forstatligande" },
  { q: "medborgarskap_aterkallelse", v: 2, l: "KD A till Ö: Medborgarskap", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/medborgarskap" },
  { q: "tandvard_hogkostnad", v: -1, l: "Tandläkartidningen: KD kräver pristak för mer tandvårdsstöd (Forssmed)", u: "https://www.tandlakartidningen.se/nyhet/valet-2026/kd-mer-tandvardsstod-kraver-pristak/" },
  { q: "narkotika_avkrim", v: 2, l: "KD A till Ö: Narkotika", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/narkotika" },
  { q: "skola_forstatliga", v: 0, l: "Vi Lärare: 22 heta valfrågor för skolan - så svarar partierna", u: "https://www.vilarare.se/nyheter/skolpolitik/22-heta-valfragor-for-skolan--sa-svarar-partierna/" }, // TODO(expertgranskning): Bekräftat genom flera sekundärkällor (nationell finansieringsnorm, ökad statlig finansiering som utt
  { q: "informationsplikt", v: 2, l: "KD A till Ö: Informationsplikt", u: "https://kristdemokraterna.se/var-politik/politik-a-till-o/informationsplikt" },
  { q: "vargjakt", v: 2, l: "Riksdagen: Svar på skriftlig fråga 2025/26:189 (landsbygdsminister Peter Kullgren, KD), 19 nov 2025", u: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svar-pa-skriftlig-fraga/licensjakt-pa-varg-2026_hd12189/" },
  { q: "strandskydd", v: 2, l: "KD A till Ö: Strandskydd", u: "https://kristdemokraterna.se/politik-a-o/strandskydd/" },
  { q: "israel_sanktioner", v: 1, l: "SVT: Busch (KD) öppnar för att ompröva regeringens linje mot Israel", u: "https://www.svt.se/nyheter/inrikes/busch-kd-oppnar-for-att-omprova-regeringens-linje-mot-israel" }, // TODO(expertgranskning): Busch säger sig stödja regeringens linje men öppnar samtidigt för att den kan omprövas om Israel vis
];

export default rows;
