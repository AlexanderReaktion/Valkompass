# Valkompass 2026 — Arkitektur & plan

En Vercel-hostad, AI-driven valkompass inför riksdagsvalet **13 september 2026**. Mål: mer genomgående, transparent och fakta-ankrad än SVT/Aftonbladet/TT-kompasserna. Statusdokument — uppdateras löpande.

## Bärande principer
1. **Transparens som konkurrensfördel** — öppen metod, källa per partiposition, synlig avsändare/finansiering. (Forskning: matchningsmetoden ändrar partirådet för upp till 90 % av användarna; svart låda urholkar förtroende. Varnande fall: valkompass.eu = dold partiagenda.)
2. **Determinism där det går, AI där det tillför** — siffran beräknas av kod; AI tolkar och förklarar, skriver aldrig om siffran.
3. **Fakta-ankring** — partipositioner belagda mot partiprogram + faktiska riksdagsvoteringar, inte bara retorik.
4. **Compliance by design** — fritext = känsliga personuppgifter (GDPR art. 9); AI Act-medvetenhet från start.

## Metodik & matchning (ren kod)
- **Tvådimensionell:** höger-vänster × GAL-TAN. Resultat som rankad topplista (%) **och** 2D-karta. Validera GAL-TAN-skalan empiriskt (reliabilitet/Mokken) före lansering — låt aldrig kartan stå ensam. **Strukturvalidering körd 2026-07** (`npm run validate:scales`, `src/analysis/scaleValidation.ts`): Cronbachs alfa + item-rest + Loevingers H på partipositionsmatrisen. Utfall: båda skalorna starka (skal-H 0.86/0.95+), `eu_makt` föll igenom (H 0.11, EU-kritik i båda blocken) och flyttades av kartaxeln. Kör om samma script på användardata (canonicalAnswers) efter lansering för riktig väljarreliabilitet.
- **Algoritm:** hybrid = medelvärde av normerad city-block + riktningslikhet (default). Riktningslikheten är en egen konstruktion (avståndsbaserad med straff när väljare och parti står på var sin sida om mitten) — INTE klassisk scalar product, medvetet: självmatch = 100 % för varje punkt på skalan, även mitten. Formeln beskrivs öppet på /om. Avancerat läge: byt metod och se hur rådet ändras.
- **Normera** avstånden (robust mot antal besvarade frågor).
- **"Vet ej"/obesvarat:** exkludera parvis, aldrig tolka som mitten. Visa hur många frågor matchningen bygger på.
- **Diskrimineringskriterium:** behåll bara frågor där partier skiljer sig; visa diskrimineringsgrad. Balansera ekonomi vs värdering. **Implementerat:** `discriminationByQuestion` (normerad std per fråga) visas i /admin och varnar i publiceringsvalideringen under tröskeln 0.25; polaritetsbalans varnar även per dimension (>75 % åt samma håll).
- **Osäkerhet:** visa avstånd mellan topp-partier / konfidens, inte exakt facit.

## Frågor
- **Två typer i datamodellen:** (a) dynamiska/aktuella (sjukvård, ekonomi, gängvåld, migration, energi/kärnkraft, skola, försvar/NATO, klimat); (b) strukturella/genomsyrande (höger-vänster, GAL-TAN, EU).
- **Generering = human-in-the-loop, ALDRIG live.** AI föreslår kandidater i admin → människa granskar/balanserar/godkänner → endast godkända serveras, **frysta + versionerade per valomgång**. Logga vem som godkänt + tidsstämpel.
- **Adaptivt/IRT-test** (Sigfrid): börja med få frågor, välj nästa mest informativa → kortare test, högre fullföljande, når fler.
- **Repeterbarhet:** användaren kan välja snabbtest, standard eller fördjupning. Varje körning får ett balanserat urval ur frågebanken; semantiskt likvärdiga formuleringar grupperas så att samma sakfråga inte dubbleras i samma test. Resultatsidan jämför ny variant mot föregående körning med topp-3-överlapp och kartavstånd.
- **Polaritet & partiledtråd:** formulera neutralt och konkret för att dämpa partiledtråd (party cue) + ja-sägartendens — folk svarar annars som "sitt" parti. Inga slogans/värdeord/blocketiketter; variera åt vilket håll "instämmer" pekar (stöds av `polarity`/spegling i intaget, motorn förblir kanonisk). Regler + granskningssteg i `docs/fragor-riktlinjer.md`.
- **Baslinjeaudit mot gällande rätt (körd juli 2026):** varje stam ska beskriva den aktuella rättsliga baslinjen; en stam får aldrig beskriva beslutad lag som ett förslag. Omankrade stammar byter betydelse och kräver re-verifiering av partipositionerna innan servering (revisionen 2026-07: 15 omankrade stammar, listade i `src/data/catalog2026.ts`). Instabila frågor får publiceringsnot i katalogen: `israel_sanktioner` ska omkontrolleras 1–2 veckor före publicering (bräcklig vapenvila, rådsläget kan ändras). Ukrainastödet fick medvetet ingen fråga: alla åtta partier står bakom stödet, spridningen är ~0 och frågan särskiljer inte (verifierat juli 2026; omprövas om enigheten spricker). Regeln formaliserad i `docs/fragor-riktlinjer.md`.
- **Användarstyrning:** visa varför varje fråga valts; låt användaren vikta ämnen. **Implementerat:** "Varför ställs frågan?" per fråga (rationale) + ämnesviktning ×1,5 på startsidan + ★-vikt ×2 per fråga.

## Partipositioner
- **Hybrid-källa:** partiernas självskattning + forskar-/källbedömning + **faktiska voteringar** (data.riksdagen.se → `voteringlista/`, `dokumentlista/`, `personlista/`, `utformat=json`, filter `rm`/parti). Visa källa per ståndpunkt; avslöj retorik vs röstning.
- **RAG:** indexera partiprogram/motioner/röstdata i pgvector. Per fråga×parti: retrieval → Claude föreslår position + **obligatoriska citat** (Structured Outputs) → **människa beslutar slutgiltig siffra**. Matchningen använder godkända siffror, aldrig LLM-förslaget.
- Färska fakta — verifiera partiledarnamn (L: Mohamsson; MP: Lind & Helldén). Tidsmarkera regeringsfrågan (SD stödparti idag; M+SD vill bilda regering efter valet).

## Fritextkommentarer + AI-analys (differentiatorn)
- Kommentarerna (per fråga + ev. övergripande) matas in i **per-användare-analysen på Opus 4.8** som ett **additivt lager** ovanpå den deterministiska matchningen — teman, nyanser, diskrepans mellan ord och skalsvar, närliggande partier på de frågor användaren själv lyfte.
- **Modellens underlag:** utöver kommentarerna får modellen användarens **skalsvar i ord** (hållning på den visade formuleringen + vikt, `buildAnswerSummaries`), **2D-koordinaterna**, toppmatchningarna med per-dimension-procent samt endast körningens relevanta frågor. Tolkningen ska grundas i det faktiska skalsvaret; saknas svar (eller "vet ej") används effekterna "lägger till prioritet"/"oklart". User-prompten byggs i `src/analysis/prompt.ts` så exakt samma sträng kan hashas.
- **Structured Outputs (schema v3):** fast JSON (sammanfattning, teman, sentiment, relaterade frågor, policy-signaler, kommentarpåverkan) + **`commentFlags`**: enskilda olämpliga kommentarer flaggas med index + skäl och utesluts; analysen byggs på de övriga. `flagged=true` bara när ingen användbar kommentar återstår. Modellens id-referenser saneras mot katalogen (`sanitizeAnalysis`) innan något returneras eller sparas.
- **Märk AI-text tydligt** och separera från siffran i UI (förtroende + AI Act art. 50).
- **Lagring (implementerat):** fritext + svarsprofil sparas med **uttryckligt art. 9-samtycke**, kopplad via slump-**session-UUID** (ej IP/e-post), **auto-radera efter 2026-09-13**. Analysen persisteras i tabellen **`analyses`** (schemaVersion, inputHash = sha-256 av exakta user-prompten, modell-id, payload) under samma samtyckesgrind och gallring – regenererbar, ett lagringsfel fäller aldrig svaret. Skicka bara pseudonymiserad text till Claude. **DPA + Zero Data Retention** så Anthropic inte persisterar.
- **Robusthet & idempotens:** durabilitetsordning samtycke → resultat → alla kommentarer → AI-anrop → analys, så kommentarerna överlever ett AI-fel. Valfritt **`runId`** (UUID) gör re-POST idempotent: alla rad-id:n härleds deterministiskt och retry dubblerar inga rader. `/api/analyze` kör med `maxDuration` 120 s (klienttimeout strax över). Klienten sparar tolkningen i localStorage och återställer den vid omladdning, med runId + fingeravtryck för stale-detektering; samtycket återställs medvetet inte. Självbetjänad radering på **`/radera`**; DSAR-endpoints `/api/session/delete` + `/api/session/export` täcker resultat, kommentarer, analyser och samtyckeslogg.

## Datamodell (utkast)
- `answers` — skalsvar + beräknad matchning, **utan** direkt identifierare.
- `comments` — fritext, kopplad via slumpmässigt `session_uuid`; samtyckesflagga + tidsstämpel; auto-gallras efter valdagen.
- `analyses` — AI-tolkningen per körning: `schema_version`, `input_hash` (sha-256 av exakta user-prompten), modell-id, payload (JSONB); samma samtyckeskrav och gallring som `comments`.
- `questions` — versionerad katalog (typ: dynamisk/strukturell; dimension; polaritet; diskrimineringsgrad; status: draft/approved; godkänd av/när).
- `party_positions` — per fråga×parti: godkänt numeriskt värde + citat/källa + version.
- `consent_log` — separat art. 9-samtycke + cookie-samtycke (tidsstämpel, bannerversion, val).
- Reproducerbarhet: spara per resultat frågeversion, skalsvar, använda partivärden, beräknad siffra, prompt-/schema-version, modell-id, input-hash.

**Implementerat hittills:**
- Matchningsmotor + intag (`src/matching/`) och frågekatalog-domän med livscykel draft→approved→published, citatkrav, partiledtråds-lint och balanskontroller (`src/catalog/`).
- **Next.js 16-app** (`app/`) — körbart flöde (frågor → matchning → topplista + 2D-karta) med utbytbar metod, samt fritextfält + art. 9-samtycke som anropar `/api/analyze`.
- **Persistens** (`src/store/`) — store-gränssnitt + in-memory (standard) + Postgres-adapter (env-styrd via `DATABASE_URL`), samtyckesgrind + retention/auto-gallring (`service.ts`), SQL-schema med pgvector (`src/db/schema.sql`).
- **RAG** (`src/rag/`) — LexicalRetriever (körbar utan embeddings-API) + förslagslogik som ger källbelagda position-UTKAST för mänskligt godkännande.
- **AI-lager** (`src/ai/`, `src/analysis/`) — Anthropic-klient (modell-id via env, adaptive thinking, Structured Outputs, prompt caching) bakom interfaces; fritextanalys som additivt lager (ändrar aldrig siffran) med skalsvar i ord som underlag och per-kommentar-flaggning (schema v3).
- **API** — `/api/analyze` (matchning + samtyckesgrindad analys + lagring inkl. persisterad analys, runId-idempotens, `maxDuration` 120, rate-limit), `/api/session/delete` + `/api/session/export` (DSAR via session-referens; självbetjänad radering på `/radera`) och `/api/admin/positions/propose` (RAG-förslag bakom `ADMIN_TOKEN`).
- **Produktionshärdning** — säkerhetsheaders (CSP/HSTS m.m., `unsafe-eval` bara i dev), rate limiting + daglig budget-spärr (Upstash i prod / in-memory i dev), input-tak (kommentarslängd/antal svar), cookie-samtycke (IMY-praxis), integritets-/metodsidor, `/api/health`, SEO (robots/sitemap/metadata/favicon). Go-live-runbook i `README.md`.
- **Admin-UI för granskning** (`/admin` + `app/api/admin/*`) — token-skyddat: lista/godkänn frågor & positioner, seed, validera & publicera (ovanpå katalog-domänen).
- **Researchad 2026-katalog** (`src/data/catalog2026.ts` + `src/data/positions2026/`) — **54 sakfrågegrupper / 74 neutrala formuleringar** (båda axlarna, blandad polaritet, variantfrågor för omtag; frågerevision 2026-07: anpassning borttagen, 8 nya frågor, 15 omankrade stammar med positioner som väntar på ompositionering; polaritetsbalans 28/26 över grundstammarna; alla stammar baslinjeauditerade mot gällande rätt juli 2026) + **592 partipositioner (inkl. varianter)** per-parti-researchade mot **aktuella källor** (partiprogram/valmanifest 2026, press-releaser, media, riksdagsmotioner/voteringar), med källa per position. Status **draft** för expertgranskning i /admin. Serveras nu i kompassen via `src/data/activeCatalog.ts`; testplanen finns i `src/kompass/testPlan.ts`. Caveat: per-parti-research → kalibreringen mellan partier bör sanity-checkas av expert (abort-raden omkalibrerad 2026-07 efter systematiskt teckenfel); viss osäkerhet på EU/euro/försörjningsstöd.
- **Resultat-UX 2026-07** — per-dimension-matchning per parti (`matchPartyByDimension`), partiets hållning i ord per fråga (`src/kompass/stance.ts`, speglar polaritet), stabila partikoordinater på kartan (hela banken deduplicerad per grupp, `uniqueGroupQuestions`), permalink med svaren i URL-fragmentet (`src/kompass/permalink.ts` — fragmentet når aldrig servern) + historik i localStorage, ämnesviktning (×1,5) och ★-vikt (×2), "Varför ställs frågan?" (rationale i UI), kommentarslager omramat som "Din profil i ord" med föreslagna kommentarsmål (starka/★-svar) och 💬-märkning av frågor som AI-tolkningen vägde in. AI-analysen får bara körningens relevanta frågor (inte variantdubbletter).
- **Deploy + drift** — `vercel.json` (EU-region arn1), schemalagd gallrings-cron (`/api/cron/purge`), `docs/DEPLOY.md`, `docs/dpia.md`.
- **165 enhetstester** (`npm test`), **produktionsbuild grön** (`npm run build`). Kör lokalt: `npm run dev` → http://localhost:3000.

**Kvar (kräver dina konton / sign-off):** provisionera Postgres (kör `schema.sql`) + `DATABASE_URL`; Upstash Redis + env; **expertverifiera & godkänn 2026-utkastet** i /admin innan publik servering; fyll i personuppgiftsansvarig + låt jurist granska DPIA/policy; ZDR/DPA + spend limit hos Anthropic; deploy på Vercel; (valfritt) embeddings/pgvector-uppgradering av RAG; byt aktiv katalog (`activeCatalog.ts`) till den expertgranskade/publicerade i stället för 2026-utkastet efter godkännande i /admin.

## Compliance-checklista
- [ ] **GDPR art. 9** — uttryckligt, separat, aktivt samtycke före kommentar (ej buntat med cookies/villkor); enkel återkallelse; dokumenterat.
- [ ] **DPIA (art. 35)** före lansering (känsliga uppgifter + AI/ny teknik utlöser kravet).
- [ ] **Retention** — auto-radera fritext, svarsprofil och AI-analyser efter 2026-09-13; dataminimering; ingen IP/identifierare i loggar.
- [ ] **Anthropic** — DPA tecknat + **ZDR**; verifiera DPF-status, SCC (Modul 2) som backup; ev. EU-residens via Bedrock Frankfurt.
- [ ] **AI Act** — art. 5 (ingen manipulation, gäller redan); art. 50 (AI-transparens/märkning) + ev. högriskregler full tillämpning **2026-08-02**; positionera som "informera/jämföra", dokumentera klassningsresonemang.
- [ ] **Cookie-banner** (IMY/PTS 2026) — "Neka alla" lika lätt som "Acceptera alla", inga förkryssade rutor/dark patterns, granulärt, logga samtycke.
- [ ] **Integritetspolicy (art. 13) + ansvarsfriskrivning** — vägledande, ej röstrekommendation; ansvarig, ändamål, grund, mottagare (Anthropic/USA), lagringstid, rättigheter.
- [ ] **Neutralitet** — balanserade frågor/svarsalternativ, alla riksdagspartier, oberoende granskning av urval, publicerad metod, möjlighet att hoppa över frågor. Synlig avsändare + finansiering.

## Teknisk stack
- **Next.js på Vercel.** Nyckeln server-side (`.env.local` / Vercel env), aldrig i klient.
- **Postgres + pgvector** (EU-region) för katalog, positioner, RAG-index, svar/kommentarer.
- **Claude:** modell-id som env-var per steg. Opus 4.8 för per-användare-analys + admin-förslag (frågor/positioner via **Batch API −50 %**). Ren kod för matchning.
- **Kostnad:** prompt caching på statiskt partidata-/metodik-block; `max_tokens`-tak; **rate limiting i Edge Middleware + global daglig budget-killswitch** före varje Claude-anrop; spend limit i Anthropic Console.
- **Versionering:** frågekatalog, partipositioner+citat, viktningsformel, prompt+schema — så samma input alltid ger samma siffra.

## Byggfaser (förslag)
1. Scaffold Next.js + Postgres/pgvector + env-setup + grundläggande deterministisk matchningsmotor (testbar).
2. Frågekatalog-datamodell + admin för godkännande/versionering.
3. RAG-pipeline för partipositioner (riksdagsdata + partiprogram) med citat + mänsklig granskning.
4. Användarflöde: adaptivt test → matchning → 2D-karta/topplista.
5. Fritext + Opus 4.8-analys (additivt lager) + samtyckes-/lagrings-/raderingslogik.
6. Compliance-yta: cookie-banner, integritetspolicy, DPIA-dokument, AI-märkning.
7. Polish, neutralitetsgranskning, lasttest, budget-skydd.

## Öppna punkter
- Adaptivt IRT-test fullt ut vs enklare viktat batteri (fas-2-beslut).
- Kandidatmatchning (personval) utöver partimatchning? (korrigera för storleksbias).
- Aggregerad fritextanalys (vad väljarna skriver) — egen feature ovanpå lagrad data.
