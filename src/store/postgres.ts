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
} from "./types.ts";

const { Pool: PoolCtor } = pgDefault;

class PgCatalogStore implements CatalogStore {
  constructor(private pool: Pool) {}

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
  constructor(private pool: Pool) {}

  async saveResult(r: ResultRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO results (id, session_id, catalog_version, method, canonical_answers, ranking, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, r.sessionId, r.catalogVersion, r.method, JSON.stringify(r.canonicalAnswers), JSON.stringify(r.ranking), r.createdAt],
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
    const r = await this.pool.query(
      "SELECT granted FROM consent_log WHERE session_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1",
      [sessionId, type],
    );
    return r.rows[0]?.granted === true;
  }

  async listComments(): Promise<CommentRecord[]> {
    const r = await this.pool.query("SELECT * FROM comments");
    return r.rows.map(rowToComment);
  }

  async purgeExpired(now: string): Promise<number> {
    const r = await this.pool.query("DELETE FROM comments WHERE delete_after <= $1", [now]);
    return r.rowCount ?? 0;
  }
}

function rowToQuestion(row: Record<string, unknown>): CatalogQuestion {
  return {
    id: String(row.id),
    kind: row.kind as CatalogQuestion["kind"],
    text: String(row.text),
    ...(row.dimension ? { dimension: row.dimension as CatalogQuestion["dimension"] } : {}),
    polarity: Number(row.polarity) === -1 ? -1 : 1,
    topic: String(row.topic),
    status: row.status as CatalogQuestion["status"],
    ...(row.rationale ? { rationale: String(row.rationale) } : {}),
    sources: (row.sources as CatalogQuestion["sources"]) ?? [],
    createdAt: toIso(row.created_at),
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
  };
}

function rowToPosition(row: Record<string, unknown>): PartyPosition {
  return {
    questionId: String(row.question_id),
    partyId: String(row.party_id),
    value: Number(row.value),
    citations: (row.citations as PartyPosition["citations"]) ?? [],
    status: row.status as PartyPosition["status"],
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: toIso(row.approved_at) } : {}),
  };
}

function rowToComment(row: Record<string, unknown>): CommentRecord {
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

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export function createPostgresStores(connectionString: string): {
  catalog: CatalogStore;
  responses: ResponseStore;
} {
  const pool = new PoolCtor({ connectionString });
  return { catalog: new PgCatalogStore(pool), responses: new PgResponseStore(pool) };
}
