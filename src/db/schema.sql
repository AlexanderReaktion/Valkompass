-- Valkompass 2026 — Postgres-schema (kör i EU-region).
-- Princip: identitet skild från innehåll. Inga IP/e-post. Fritext = känsliga
-- art. 9-data, separat tabell, samtyckeskrav, auto-gallring efter valdagen.

CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector för RAG
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- Frågekatalog ----------

CREATE TABLE IF NOT EXISTS catalog_versions (
  version       integer PRIMARY KEY,
  election      text NOT NULL,
  published_at  timestamptz NOT NULL,
  scale_min     numeric NOT NULL,
  scale_max     numeric NOT NULL,
  payload       jsonb NOT NULL                  -- frusen PublishedCatalog
);

CREATE TABLE IF NOT EXISTS questions (
  id           text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('dynamic','structural')),
  text         text NOT NULL,
  dimension    text,                            -- 'economic' | 'galtan' | null
  polarity     smallint NOT NULL DEFAULT 1 CHECK (polarity IN (1,-1)),
  topic        text NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft','approved','archived')),
  rationale    text,
  sources      jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL,
  approved_by  text,
  approved_at  timestamptz
);

CREATE TABLE IF NOT EXISTS party_positions (
  question_id  text NOT NULL REFERENCES questions(id),
  party_id     text NOT NULL,
  value        numeric NOT NULL,                -- kanoniskt, av-polariserat
  citations    jsonb NOT NULL DEFAULT '[]',     -- minst en vid godkännande
  status       text NOT NULL CHECK (status IN ('draft','approved','archived')),
  approved_by  text,
  approved_at  timestamptz,
  PRIMARY KEY (question_id, party_id)
);

-- ---------- RAG-korpus ----------

CREATE TABLE IF NOT EXISTS doc_chunks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id     text,
  source_label text NOT NULL,                   -- t.ex. "Partiprogram (S) 2025 s.12"
  source_url   text,
  content      text NOT NULL,
  embedding    vector(1024)                     -- justera dim efter embeddingsmodell
);
CREATE INDEX IF NOT EXISTS doc_chunks_party_idx ON doc_chunks (party_id);
-- Vektorindex aktiveras när embeddings fylls i:
-- CREATE INDEX ON doc_chunks USING hnsw (embedding vector_cosine_ops);

-- ---------- Användardata ----------

-- Resultat: skalsvar + matchning. Ingen direkt identifierare.
CREATE TABLE IF NOT EXISTS results (
  id               uuid PRIMARY KEY,
  session_id       uuid NOT NULL,               -- slumpmässigt, ej IP/e-post
  catalog_version  integer NOT NULL,
  method           text NOT NULL,
  canonical_answers jsonb NOT NULL,
  ranking          jsonb NOT NULL,
  created_at       timestamptz NOT NULL,
  delete_after     timestamptz NOT NULL          -- gallras tillsammans med ev. fritext
);
ALTER TABLE results ADD COLUMN IF NOT EXISTS delete_after timestamptz;
UPDATE results SET delete_after = '2026-09-13T23:59:59.999Z' WHERE delete_after IS NULL;
ALTER TABLE results ALTER COLUMN delete_after SET NOT NULL;
CREATE INDEX IF NOT EXISTS results_delete_after_idx ON results (delete_after);

-- Fritext: känsliga art. 9-data. Samtyckeskrav + auto-gallring.
CREATE TABLE IF NOT EXISTS comments (
  id           uuid PRIMARY KEY,
  session_id   uuid NOT NULL,
  question_id  text,
  text         text NOT NULL,
  analysis     jsonb,                           -- additivt AI-lager (regenererbart)
  created_at   timestamptz NOT NULL,
  delete_after timestamptz NOT NULL             -- gallras automatiskt efter valdagen
);
CREATE INDEX IF NOT EXISTS comments_delete_after_idx ON comments (delete_after);

CREATE TABLE IF NOT EXISTS consent_log (
  id             uuid PRIMARY KEY,
  session_id     uuid NOT NULL,
  type           text NOT NULL CHECK (type IN ('article9_freetext','cookies')),
  granted        boolean NOT NULL,
  banner_version text NOT NULL,
  created_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS consent_session_idx ON consent_log (session_id, type, created_at);

-- Gallringsjobb (kör t.ex. dagligen via cron):
--   DELETE FROM comments WHERE delete_after <= now();
--
-- Försvar på djupet: även om app-cronen (Vercel /api/cron/purge) skulle utebli
-- raderar databasen själv utgångna rader. Kräver pg_cron (Supabase: aktivera
-- under Database -> Extensions). Avkommentera för att aktivera skyddsnätet:
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--     'valkompass-purge-comments', '15 3 * * *',
--     $$DELETE FROM comments WHERE delete_after <= now()$$);
--   SELECT cron.schedule(
--     'valkompass-purge-results', '20 3 * * *',
--     $$DELETE FROM results WHERE delete_after <= now()$$);

-- ---------- RLS: lås Supabase auto-API:t ----------
-- Appen ansluter direkt som ägarrollen `postgres` (kringgår RLS). Supabase
-- exponerar dessutom public-schemat via PostgREST/GraphQL med den publika
-- anon-nyckeln. RLS utan policy nekar alla icke-privilegierade roller där,
-- utan att påverka appens direktanslutning. Idempotent.
ALTER TABLE catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE results          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_log      ENABLE ROW LEVEL SECURITY;
