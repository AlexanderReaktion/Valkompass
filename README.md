# Valkompass 2026

Tvådimensionell, transparent och fakta-ankrad valkompass inför riksdagsvalet 13 september 2026.
Next.js (App Router) + deterministisk matchningsmotor + Anthropic Claude för fritextanalys.

Arkitektur och beslut: se [ARCHITECTURE.md](ARCHITECTURE.md). Frågeriktlinjer: [docs/fragor-riktlinjer.md](docs/fragor-riktlinjer.md).

## Utveckling

```bash
npm install
cp .env.example .env.local   # fyll i ANTHROPIC_API_KEY för AI-analys
npm run dev                  # http://localhost:3000
npm test                     # enhetstester
npm run build                # produktionsbuild
```

Utan `DATABASE_URL` / `UPSTASH_*` används in-memory-fallbacks (ok lokalt, ej för publik drift).

## Go-live-runbook

Kodsidan är produktionshärdad (säkerhetsheaders, rate limiting + budget-spärr, input-tak,
samtyckesgrind, cookie-banner, juridiska sidor, health-check, SEO). Följande kräver dina konton,
innehåll eller juridisk granskning:

1. **Databas (obligatoriskt).** Skapa Postgres i EU (Neon/Vercel Postgres), kör `src/db/schema.sql`
   (kräver `vector`-extension), sätt `DATABASE_URL`.
2. **Rate limit/budget (obligatoriskt på serverless).** Skapa Upstash Redis, sätt `UPSTASH_REDIS_REST_URL`
   och `UPSTASH_REDIS_REST_TOKEN`. Annars delas inte räknare mellan Vercel-instanser.
3. **Anthropic.** Sätt **spend limit** i Console (hård kostnadsspärr). Teckna **DPA** och begär
   **Zero Data Retention**. Verifiera DPF-status. Överväg EU-residens (Bedrock Frankfurt).
4. **Innehåll (blockerar publik lansering).** Expertgranska och godkänn 2026-utkastet i `/admin`
   innan det används publikt. Publicera inte ogranskade eller påhittade partiståndpunkter.
5. **Juridik.** Genomför och dokumentera en **DPIA**. Fyll i personuppgiftsansvarig i
   `app/integritet/page.tsx` och låt jurist granska. Utred AI Act-klassningen (designa som
   "informera/jämföra", inte "påverka röstning").
6. **Miljövariabler.** Sätt `NEXT_PUBLIC_SITE_URL`, `ADMIN_TOKEN`, modell-id, `CONSENT_BANNER_VERSION`.
7. **Deploy.** Importera repot i Vercel, lägg in alla env-variabler (server-side), deploya.
   Kontrollera `/api/health`.

## Säkerhet

- API-nyckeln är **server-side only** och anropas bara i API-routes. Aldrig i klientkod.
- Fritextkommentarer och skalsvar i AI-analysen = känsliga art. 9-data: lagras endast med uttryckligt
  samtycke, pseudonymiserat, och gallras automatiskt efter valdagen.
