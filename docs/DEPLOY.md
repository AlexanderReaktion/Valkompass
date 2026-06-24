# Deploy-guide — Valkompass 2026 på Vercel

Förberett i koden: säkerhetsheaders, rate limiting + budget-spärr, samtycke/retention,
EU-region (`arn1`, Stockholm) och en daglig gallrings-cron (`vercel.json`). Det här gör DU.

## 1. Versionshantering
```bash
git init && git add . && git commit -m "Valkompass 2026"
# pusha till GitHub (privat repo rekommenderas)
```
`.env.local` är gitignored — nyckeln följer inte med. Bra.

## 2. Postgres (EU)
- Skapa en Postgres-databas i EU — **Vercel Postgres** (välj EU-region) eller **Neon** (eu-central).
- Kör schemat: anslut och kör innehållet i [`../src/db/schema.sql`](../src/db/schema.sql)
  (kräver `vector`-extension för pgvector).
- **Använd en transaction-mode/serverless pooler för `DATABASE_URL`** (Supabase Supavisor
  port `6543`, Neon pooled-endpoint, PgBouncer i transaction mode). Serverless-funktioner
  startar många korta instanser; en **session-mode-anslutning (port `5432`) håller en
  anslutning per instans** och tar snabbt slut på databasens connection-budget. Poolen i
  appen är dessutom medvetet liten (`PGPOOL_MAX`, default 3).
- **TLS (verify-full):** sätt `DATABASE_CA_CERT` till leverantörens CA-certifikat (PEM)
  så att servern verifieras. Utan den ansluter appen krypterat men **overifierat**
  (`rejectUnauthorized:false`) och loggar en varning vid start.
- **Retention-skyddsnät (pg_cron):** app-cronen (steg 6) gallrar normalt, men aktivera
  gärna pg_cron-blocket i [`../src/db/schema.sql`](../src/db/schema.sql) som försvar på
  djupet — databasen raderar då själv utgångna `comments`/`results` även om app-cronen uteblir.
- Kopiera connection string (poolad) → `DATABASE_URL`.

## 3. Upstash Redis (rate limit + budget)
- Skapa en Upstash Redis-databas (EU-region).
- Kopiera REST-URL och token → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Utan dessa delas inte räknare mellan serverless-instanser.

## 4. Anthropic
- Sätt en **spend limit** i Console (hård kostnadsspärr).
- Teckna **DPA** och begär **Zero Data Retention**. Verifiera DPF-status.
- (Valfritt) EU-residens via Amazon Bedrock Frankfurt i stället för förstaparts-US-API.

## 5. Importera i Vercel
- New Project → importera GitHub-repot. Next.js detekteras automatiskt.
- **Environment Variables** (alla server-side, för Production + Preview):

  | Variabel | Värde |
  |---|---|
  | `ANTHROPIC_API_KEY` | din nyckel |
  | `MODEL_ANALYSIS` / `MODEL_POSITIONS` | `claude-opus-4-8` |
  | `DATABASE_URL` | från steg 2 (poolad, transaction mode) |
  | `DATABASE_CA_CERT` | (rek.) CA-cert (PEM) för verify-full TLS |
  | `PGPOOL_MAX` | (valfritt) max poolanslutningar per instans, default `3` |
  | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | från steg 3 |
  | `ADMIN_TOKEN` | lång slumpsträng (admin-granskning) |
  | `CRON_SECRET` | lång slumpsträng (skyddar gallrings-cron) |
  | `NEXT_PUBLIC_SITE_URL` | din publika URL |
  | `CONSENT_BANNER_VERSION` | `v1` |
  | `RATE_LIMIT_PER_MIN` / `DAILY_AI_CALL_BUDGET` | t.ex. `20` / `500` |

## 6. Deploya och verifiera
- Deploya. Kontrollera `https://<din-domän>/api/health` → `{"status":"ok","ai":true,"db":true,"rateLimiter":"upstash"}`.
- Bekräfta att cron-jobbet syns under Project → Cron Jobs (kör `/api/cron/purge` 03:00 dagligen).
- Testa kompassen + en kommentar (samtycke). Kontrollera att inga kommentarer loggas i klartext.

## 7. Innan publikt (blockerare)
- Expertgranska och publicera den researchade 2026-katalogen i admin-UI:t innan tjänsten öppnas publikt.
- Fastställ personuppgiftsansvarig i integritetspolicyn; slutför och låt jurist granska
  [`dpia.md`](dpia.md) + policyn.
- Dokumentera AI Act-klassningen.
