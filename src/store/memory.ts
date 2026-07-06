/**
 * In-memory-implementation av store-gränssnitten.
 *
 * Används i tester och som standard i utveckling. I produktion väljs
 * Postgres-implementationen via getStores() när DATABASE_URL är satt.
 */

import type { CatalogQuestion, PartyPosition, PublishedCatalog } from "../catalog/types.ts";
import type {
  AnalysisRecord,
  CatalogStore,
  CommentRecord,
  ConsentRecord,
  ConsentType,
  ResponseStore,
  ResultRecord,
  SessionExport,
} from "./types.ts";

export class MemoryCatalogStore implements CatalogStore {
  // Speglar Postgres-semantiken: lagra per (election -> version -> katalog) och
  // returnera den med högsta version (Postgres: ORDER BY version DESC LIMIT 1).
  private published = new Map<string, Map<number, PublishedCatalog>>();
  private questions = new Map<string, CatalogQuestion>();
  private positions = new Map<string, PartyPosition>();

  async getPublished(election: string): Promise<PublishedCatalog | null> {
    const versions = this.published.get(election);
    if (!versions || versions.size === 0) return null;
    let maxVersion = -Infinity;
    for (const v of versions.keys()) if (v > maxVersion) maxVersion = v;
    return versions.get(maxVersion) ?? null;
  }
  async savePublished(catalog: PublishedCatalog): Promise<void> {
    let versions = this.published.get(catalog.election);
    if (!versions) {
      versions = new Map<number, PublishedCatalog>();
      this.published.set(catalog.election, versions);
    }
    versions.set(catalog.version, catalog);
  }
  async saveQuestion(q: CatalogQuestion): Promise<void> {
    this.questions.set(q.id, q);
  }
  async listQuestions(): Promise<CatalogQuestion[]> {
    return [...this.questions.values()];
  }
  async savePosition(p: PartyPosition): Promise<void> {
    this.positions.set(`${p.questionId}::${p.partyId}`, p);
  }
  async listPositions(): Promise<PartyPosition[]> {
    return [...this.positions.values()];
  }
}

export class MemoryResponseStore implements ResponseStore {
  // Nycklat på id och skrivs bara en gång per id – speglar Postgres
  // ON CONFLICT (id) DO NOTHING, så idempotenta omkörningar (samma runId)
  // inte dubblerar rader.
  private results = new Map<string, ResultRecord>();
  private comments = new Map<string, CommentRecord>();
  private consents = new Map<string, ConsentRecord>();
  private analyses = new Map<string, AnalysisRecord>();

  async saveResult(r: ResultRecord): Promise<void> {
    if (!this.results.has(r.id)) this.results.set(r.id, r);
  }
  async saveComment(c: CommentRecord): Promise<void> {
    if (!this.comments.has(c.id)) this.comments.set(c.id, c);
  }
  async logConsent(c: ConsentRecord): Promise<void> {
    if (!this.consents.has(c.id)) this.consents.set(c.id, c);
  }
  async saveAnalysis(a: AnalysisRecord): Promise<void> {
    if (!this.analyses.has(a.id)) this.analyses.set(a.id, a);
  }
  async hasConsent(sessionId: string, type: ConsentType): Promise<boolean> {
    // Senast loggade samtycke för (session, typ) avgör. Vid samma createdAt
    // avgör inläggningsordningen (sista vinner) — speglar Postgres ', id DESC'.
    // Obs: i dag finns ingen återkallandeväg för article9_freetext, så detta är
    // tills vidare endast latent (samma intent dokumenteras i postgres.ts).
    let latest: ConsentRecord | undefined;
    for (const c of this.consents.values()) {
      if (c.sessionId === sessionId && c.type === type) {
        if (!latest || c.createdAt >= latest.createdAt) latest = c;
      }
    }
    return latest?.granted ?? false;
  }
  async purgeExpired(now: string): Promise<number> {
    let removed = 0;
    for (const map of [this.comments, this.results, this.analyses] as const) {
      for (const [id, rec] of map) {
        if (rec.deleteAfter <= now) {
          map.delete(id);
          removed += 1;
        }
      }
    }
    return removed;
  }

  async deleteBySession(sessionId: string): Promise<number> {
    let removed = 0;
    for (const map of [this.results, this.comments, this.consents, this.analyses] as const) {
      for (const [id, rec] of map) {
        if (rec.sessionId === sessionId) {
          map.delete(id);
          removed += 1;
        }
      }
    }
    return removed;
  }

  async exportBySession(sessionId: string): Promise<SessionExport> {
    const bySession = <T extends { sessionId: string }>(map: Map<string, T>): T[] =>
      [...map.values()].filter((r) => r.sessionId === sessionId);
    return {
      results: bySession(this.results),
      comments: bySession(this.comments),
      consents: bySession(this.consents),
      analyses: bySession(this.analyses),
    };
  }

  /** Testhjälp: läsvy över lagrade kommentarer (ersätter borttagna listComments). */
  _commentsForTest(): readonly CommentRecord[] {
    return [...this.comments.values()];
  }
}
