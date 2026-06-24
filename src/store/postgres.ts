/**
 * Postgres-implementation av store-gränssnitten (env-styrd, via getStores()).
 *
 * Laddas bara när DATABASE_URL är satt. Kör src/db/schema.sql först.
 * Inte i hetlinjen under utveckling — in-memory är standard.
 */

import pgDefault from "pg";
import type { Pool } from "pg";

import type { CatalogQuestion, PartyPosition, PublishedCatalog } from "../catalog/types.ts";
import type {
  CatalogStore,
  CommentRecord,
  ConsentRecord,
  ConsentType,
  ResponseStore,
  ResultRecord,
  SessionExport,
} from "./types.ts";

const { Pool: PoolCtor } = pgDefault;

class PgCatalogStore implements CatalogStore {
  private pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getPublished(election: string): Promise<PublishedCatalog | null> {
    const r = await this.pool.query(
      "SELECT payload FROM catalog_versions WHERE election = $1 ORDER BY version DESC LIMIT 1",
      [election],
    );
    return r.rows[0] ? (r.rows[0].payload as PublishedCatalog) : null;
  }

  async savePublished(c: PublishedCatalog): Promise<void> {
    await this.pool.query(
      `INSERT INTO catalog_versions (version, election, published_at, scale_min, scale_max, payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (version) DO UPDATE SET payload = EXCLUDED.payload`,
      [c.version, c.election, c.publishedAt, c.scale.min, c.scale.max, JSON.stringify(c)],
    );
  }

  async saveQuestion(q: CatalogQuestion): Promise<void> {
    await this.pool.query(
      `INSERT INTO questions (id, kind, text, dimension, polarity, topic, status, rationale, sources, created_at, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         text=EXCLUDED.text, dimension=EXCLUDED.dimension, polarity=EXCLUDED.polarity,
         topic=EXCLUDED.topic, status=EXCLUDED.status, rationale=EXCLUDED.rationale,
         sources=EXCLUDED.sources, approved_by=EXCLUDED.approved_by, approved_at=EXCLUDED.approved_at`,
      [q.id, q.kind, q.text, q.dimension ?? null, q.polarity, q.topic, q.status, q.rationale ?? null, JSON.stringify(q.sources), q.createdAt, q.approvedBy ?? null, q.approvedAt ?? null],
    );
  }

  async listQuestions(): Promise<CatalogQuestion[]> {
    const r = await this.pool.query("SELECT * FROM questions ORDER BY id");
    return r.rows.map(rowToQuestion);
  }

  async savePosition(p: PartyPosition): Promise<void> {
    await this.pool.query(
      `INSERT INTO party_positions (question_id, party_id, value, citations, status, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (question_id, party_id) DO UPDATE SET
         value=EXCLUDED.value, citations=EXCLUDED.citations, status=EXCLUDED.status,
         approved_by=EXCLUDED.approved_by, approved_at=EXCLUDED.approved_at`,
      [p.questionId, p.partyId, p.value, JSON.stringify(p.citations), p.status, p.approvedBy ?? null, p.approvedAt ?? null],
    );
  }

  async listPositions(): Promise<PartyPosition[]> {
    const r = await this.pool.query("SELECT * FROM party_positions");
    return r.rows.map(rowToPosition);
  }
}

class PgResponseStore implements ResponseStore {
  private pool: Pool;
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async saveResult(r: ResultRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO results (id, session_id, catalog_version, method, canonical_answers, ranking, created_at, delete_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, r.sessionId, r.catalogVersion, r.method, JSON.stringify(r.canonicalAnswers), JSON.stringify(r.ranking), r.createdAt, r.deleteAfter],
    );
  }

  async saveComment(c: CommentRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO comments (id, session_id, question_id, text, analysis, created_at, delete_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, c.sessionId, c.questionId ?? null, c.text, c.analysis === undefined ? null : JSON.stringify(c.analysis), c.createdAt, c.deleteAfter],
    );
  }

  async logConsent(c: ConsentRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO consent_log (id, session_id, type, granted, banner_version, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [c.id, c.sessionId, c.type, c.granted, c.bannerVersion, c.createdAt],
    );
  }

  async hasConsent(sessionId: string, type: ConsentType): Promise<boolean> {
    // ', id DESC' som tiebreaker när två rader delar created_at (deterministiskt).
    // Obs: i dag finns ingen återkallandeväg för article9_freetext, så ett
    // återkallat samtycke kan i praktiken inte uppstå — tiebreakern är tills
    // vidare endast latent (samma intent speglas i memory.ts).
    const r = await this.pool.query(
      "SELECT granted FROM consent_log WHERE session_id=$1 AND type=$2 ORDER BY created_at DESC, id DESC LIMIT 1",
      [sessionId, type],
    );
    return r.rows[0]?.granted === true;
  }

  async purgeExpired(now: string): Promise<number> {
    const comments = await this.pool.query("DELETE FROM comments WHERE delete_after <= $1", [now]);
    const results = await this.pool.query("DELETE FROM results WHERE delete_after <= $1", [now]);
    return (comments.rowCount ?? 0) + (results.rowCount ?? 0);
  }

  async deleteBySession(sessionId: string): Promise<number> {
    // DSAR — radering (art. 17): parametriserade DELETEs för sessionens alla rader.
    const results = await this.pool.query("DELETE FROM results WHERE session_id=$1", [sessionId]);
    const comments = await this.pool.query("DELETE FROM comments WHERE session_id=$1", [sessionId]);
    const consents = await this.pool.query("DELETE FROM consent_log WHERE session_id=$1", [sessionId]);
    return (results.rowCount ?? 0) + (comments.rowCount ?? 0) + (consents.rowCount ?? 0);
  }

  async exportBySession(sessionId: string): Promise<SessionExport> {
    // DSAR — export (art. 15): parametriserade SELECTs över sessionens alla rader.
    const results = await this.pool.query("SELECT * FROM results WHERE session_id=$1", [sessionId]);
    const comments = await this.pool.query("SELECT * FROM comments WHERE session_id=$1", [sessionId]);
    const consents = await this.pool.query("SELECT * FROM consent_log WHERE session_id=$1", [sessionId]);
    return {
      results: results.rows.map(rowToResult),
      comments: comments.rows.map(rowToComment),
      consents: consents.rows.map(rowToConsent),
    };
  }
}

/**
 * Vakt för fält som DB:n garanterar via CHECK men typsystemet inte ser.
 * Kastar om värdet ligger utanför `allowed` — fail fast hellre än en korrupt
 * union smyger ner i domänlagret. (Polarity normaliseras separat, se ~rad 130.)
 */
function asEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Ogiltigt värde i kolumn ${field}: ${String(value)}`);
}

export function rowToQuestion(row: Record<string, unknown>): CatalogQuestion {
  return {
    id: String(row.id),
    kind: asEnum(row.kind, ["dynamic", "structural"], "kind"),
    text: String(row.text),
    ...(row.dimension ? { dimension: asEnum(row.dimension, ["economic", "galtan"] as const, "dimension") } : {}),
    polarity: Number(row.polarity) === -1 ? -1 : 1,
    topic: String(row.topic),
    status: asEnum(row.status, ["draft", "approved", "archived"], "status"),
    ...(row.rationale ? { rationale: String(row.rationale) } : {}),
    sources: (row.sources as CatalogQuestion["sources"]) ?? [],
    createdAt: toIso(row.created_at),
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
  };
}

export function rowToPosition(row: Record<string, unknown>): PartyPosition {
  return {
    questionId: String(row.question_id),
    partyId: String(row.party_id),
    value: Number(row.value),
    citations: (row.citations as PartyPosition["citations"]) ?? [],
    status: asEnum(row.status, ["draft", "approved", "archived"], "status"),
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
  };
}

export function rowToComment(row: Record<string, unknown>): CommentRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    ...(row.question_id ? { questionId: String(row.question_id) } : {}),
    text: String(row.text),
    createdAt: toIso(row.created_at),
    deleteAfter: toIso(row.delete_after),
    ...(row.analysis !== null && row.analysis !== undefined ? { analysis: row.analysis } : {}),
  };
}

function rowToResult(row: Record<string, unknown>): ResultRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    catalogVersion: Number(row.catalog_version),
    method: String(row.method),
    canonicalAnswers: (row.canonical_answers as ResultRecord["canonicalAnswers"]) ?? {},
    ranking: row.ranking,
    createdAt: toIso(row.created_at),
    deleteAfter: toIso(row.delete_after),
  };
}

function rowToConsent(row: Record<string, unknown>): ConsentRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    type: asEnum(row.type, ["article9_freetext", "cookies"], "type"),
    granted: row.granted === true,
    bannerVersion: String(row.banner_version),
    createdAt: toIso(row.created_at),
  };
}

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

/**
 * TLS-konfig för molndatabasen. Med DATABASE_CA_CERT verifieras servern mot
 * den medskickade CA:n (verify-full). Utan den faller vi tillbaka till krypterad
 * men overifierad anslutning — och varnar EN gång så det inte tyst blir norm.
 */
let caWarned = false;
function dbSsl(): false | { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: false } {
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) return { ca, rejectUnauthorized: true };
  if (!caWarned) {
    caWarned = true;
    console.warn(
      "[store] DATABASE_CA_CERT saknas — TLS-certvalidering är AVSTÄNGD (rejectUnauthorized:false). Sätt DATABASE_CA_CERT för verify-full.",
    );
  }
  return { rejectUnauthorized: false };
}

export function createPostgresStores(connectionString: string): {
  catalog: CatalogStore;
  responses: ResponseStore;
} {
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  // Supabase/molndatabaser kräver SSL; lokal Postgres gör det inte.
  // Serverless-säkra gränser: liten pool, korta timeouts, statement_timeout så att
  // en hängande query inte håller en anslutning evigt.
  const max = Number(process.env.PGPOOL_MAX) || 3;
  const pool = new PoolCtor({
    connectionString,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 15000,
    ...(isLocal ? {} : { ssl: dbSsl() }),
  });
  // En backend-fel på en idle-klient avges som 'error' på poolen; utan lyssnare
  // kraschar processen (unhandled). Logga och låt poolen återhämta sig.
  pool.on("error", (e) => {
    console.error("[store] Oväntat fel på idle Postgres-klient:", e);
  });
  return { catalog: new PgCatalogStore(pool), responses: new PgResponseStore(pool) };
}
