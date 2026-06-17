# Valkompass 2026 — Arkitektur & plan

En Vercel-hostad, AI-driven valkompass inför riksdagsvalet **13 september 2026**. Mål: mer genomgående, transparent och fakta-ankrad än SVT/Aftonbladet/TT-kompasserna. Statusdokument — uppdateras löpande.

## Bärande principer
1. **Transparens som konkurrensfördel** — öppen metod, källa per partiposition, synlig avsändare/finansiering. (Forskning: matchningsmetoden ändrar partirådet för upp till 90 % av användarna; svart låda urholkar förtroende. Varnande fall: valkompass.eu = dold partiagenda.)
2. **Determinism där det går, AI där det tillför** — siffran beräknas av kod; AI tolkar och förklarar, skriver aldrig om siffran.
3. **Fakta-ankring** — partipositioner belagda mot partiprogram + faktiska riksdagsvoteringar, inte bara retorik.
4. **Compliance by design** — fritext = känsliga personuppgifter (GDPR art. 9); AI Act-medvetenhet från start.

## Metodik & matchning (ren kod)
- **Tvådimensionell:** höger-vänster × GAL-TAN. Resultat som rankad topplista (%) **och** 2D-karta. Validera GAL-TAN-skalan empiriskt (reliabilitet/Mokken) före lansering — låt aldrig kartan stå ensam.
- **Algoritm:** hybrid = medelvärde av normerad city-block + scalar product (default). Avancerat läge: byt metod och se hur rådet ändras.
- **Normera** avstånden (robust mot antal besvarade frågor).
- **"Vet ej"/obesvarat:** exkludera parvis, aldrig tolka som mitten. Visa hur många frågor matchningen bygger på.
- **Diskrimineringskriterium:** behåll bara frågor där partier skiljer sig; visa diskrimineringsgrad. Balansera ekonomi vs värdering.
- **Osäkerhet:** visa avstånd mellan topp-partier / konfidens, inte exakt facit.

## Frågor
- **Två typer i datamodellen:** (a) dynamiska/aktuella (sjukvård, ekonomi, gängvåld, migration, energi/kärnkraft, skola, försvar/NATO, klimat); (b) strukturella/genomsyrande (höger-vänster, GAL-TAN, EU).
- **Generering = human-in-the-loop, ALDRIG live.** AI föreslår kandidater i admin → människa granskar/balanserar/godkänner → endast godkända serveras, **frysta + versionerade per valomgång**. Logga vem som godkänt + tidsstämpel.
- **Adaptivt/IRT-test** (Sigfrid): börja med få frågor, välj nästa mest informativa → kortare test, högre fullföljande, når fler.
- **Polaritet & partiledtråd:** formulera neutralt och konkret för att dämpa partiledtråd (party cue) + ja-sägartendens — folk svarar annars som "sitt" parti. Inga slogans/värdeord/blocketiketter; variera åt vilket håll "instämmer" pekar (stöds av `polarity`/spegling i intaget, motorn förblir kanonisk). Regler + granskningssteg i `docs/fragor-riktlinjer.md`.
- **Användarstyrning:** visa varför varje fråga valts; låt användaren lägga till/vikta ämnen.

## Partipositioner
- **Hybrid-källa:** partiernas självskattning + forskar-/källbedömning + **faktiska voteringar** (data.riksdagen.se → `voteringlista/`, `dokumentlista/`, `personlista/`, `utformat=json`, filter `rm`/parti). Visa källa per ståndpunkt; avslöj retorik vs röstning.
- **RAG:** indexera partiprogram/motioner/röstdata i pgvector. Per fråga×parti: retrieval → Claude föreslår position + **obligatoriska citat** (Structured Outputs) → **människa beslutar slutgiltig siffra**. Matchningen använder godkända siffror, aldrig LLM-förslaget.
- Färska fakta — verifiera partiledarnamn (L: Mohamsson; MP: Lind & Helldén). Tidsmarkera regeringsfrågan (SD stödparti idag; M+SD vill bilda regering efter valet).

## Fritextkommentarer + AI-analys (differentiatorn)
- Kommentaren matas in i **per-användare-analysen på Opus 4.8** som ett **additivt lager** ovanpå den deterministiska matchningen — teman, nyanser, diskrepans mellan ord och skalsvar, närliggande partier på de frågor användaren själv lyfte.
- **Structured Outputs:** fast JSON (teman, sentiment, relaterade frågor, policy-signaler, moderation-flagga). Flaggat innehåll går inte in i resultatet.
- **Märk AI-text tydligt** och separera från siffran i UI (förtroende + AI Act art. 50).
- **Lagring (beslut):** spara fritext med **uttryckligt art. 9-samtycke**, kopplad via slump-**session-UUID** (ej IP/e-post), **auto-radera efter 2026-09-13**. Skicka bara pseudonymiserad text till Claude. **DPA + Zero Data Retention** så Anthropic inte persisterar.

## Datamodell (utkast)
- `answers` — skalsvar + beräknad matchning, **utan** direkt identifierare.
- `comments` — fritext, kopplad via slumpmässigt `session_uuid`; samtyckesflagga + tidsstämpel; auto-gallras efter valdagen.
- `questions` — versionerad katalog (typ: dynamisk/strukturell; dimension; polaritet; diskrimineringsgrad; status: draft/approved; godkänd av/när).
- `party_positions` — per fråga×parti: godkänt numeriskt värde + citat/källa + version.
- `consent_log` — separat art. 9-samtycke + cookie-samtycke (tidsstämpel, bannerversion, val).
- Reproducerbarhet: spara per resultat frågeversion, skalsvar, använda partivärden, beräknad siffra, prompt-/schema-version, modell-id, input-hash.

**Implementerat hittills:**
- Matchningsmotor + intag (`src/matching/`) och frågekatalog-domän med livscykel draft→approved→published, citatkrav, partiledtråds-lint och balanskontroller (`src/catalog/`).
- **Next.js 16-app** (`app/`) — körbart flöde (frågor → matchning → topplista + 2D-karta) med utbytbar metod, samt fritextfält + art. 9-samtycke som anropar `/api/analyze`.
- **Persistens** (`src/store/`) — store-gränssnitt + in-memory (standard) + Postgres-adapter (env-styrd via `DATABASE_URL`), samtyckesgrind + retention/auto-gallring (`service.ts`), SQL-schema med pgvector (`src/db/schema.sql`).
- **RAG** (`src/rag/`) — LexicalRetriever (körbar utan embeddings-API) + förslagslogik som ger källbelagda position-UTKAST för mänskligt godkännande.
- **AI-lager** (`src/ai/`, `src/analysis/`) — Anthropic-klient (modell-id via env, adaptive thinking, Structured Outputs, prompt caching) bakom interfaces; fritextanalys som additivt lager (ändrar aldrig siffran), moderation-flagga.
- **API** — `/api/analyze` (matchning + samtyckesgrindad analys + lagring, rate-limit) och `/api/admin/positions/propose` (RAG-förslag bakom `ADMIN_TOKEN`).
- **Produktionshärdning** — säkerhetsheaders (CSP/HSTS m.m., `unsafe-eval` bara i dev), rate limiting + daglig budget-spärr (Upstash i prod / in-memory i dev), input-tak (kommentarslängd/antal svar), cookie-samtycke (IMY-praxis), integritets-/metodsidor, `/api/health`, SEO (robots/sitemap/metadata/favicon). Go-live-runbook i `README.md`.
- **Admin-UI för granskning** (`/admin` + `app/api/admin/*`) — token-skyddat: lista/godkänn frågor & positioner, seed, validera & publicera (ovanpå katalog-domänen).
- **Researchad 2026-katalog** (`src/data/catalog2026.ts` + `src/data/positions2026/`) — **45 neutralt formulerade frågor** (båda axlarna, blandad polaritet) + **360 partipositioner** per-parti-researchade mot **aktuella källor** (partiprogram/valmanifest 2026, press-releaser, media, riksdagsmotioner/voteringar), med källa per position. Status **draft** för expertgranskning i /admin. Serveras nu i kompassen via `src/data/activeCatalog.ts`. Caveat: per-parti-research → kalibreringen mellan partier bör sanity-checkas av expert; viss osäkerhet på EU/euro/försörjningsstöd.
- **Deploy + drift** — `vercel.json` (EU-region arn1), schemalagd gallrings-cron (`/api/cron/purge`), `docs/DEPLOY.md`, `docs/dpia.md`.
- **65 enhetstester** (`npm test`), **produktionsbuild grön** (`npm run build`). Kör lokalt: `npm run dev` → http://localhost:3000.

**Kvar (kräver dina konton / sign-off):** provisionera Postgres (kör `schema.sql`) + `DATABASE_URL`; Upstash Redis + env; **expertverifiera & godkänn 2026-utkastet** i /admin innан publik servering; fyll i personuppgiftsansvarig + låt jurist granska DPIA/policy; ZDR/DPA + spend limit hos Anthropic; deploy på Vercel; (valfritt) embeddings/pgvector-uppgradering av RAG; byt aktiv katalog (`activeCatalog.ts`) till den expertgranskade/publicerade i stället för 2026-utkastet efter godkännande i /admin.

## Compliance-checklista
- [ ] **GDPR art. 9** — uttryckligt, separat, aktivt samtycke före kommentar (ej buntat med cookies/villkor); enkel återkallelse; dokumenterat.
- [ ] **DPIA (art. 35)** före lansering (känsliga uppgifter + AI/ny teknik utlöser kravet).
- [ ] **Retention** — auto-radera fritext efter 2026-09-13; dataminimering; ingen IP/identifierare i loggar.
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
