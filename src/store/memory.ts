/**
 * In-memory-implementation av store-gränssnitten.
 *
 * Används i tester och som standard i utveckling. I produktion väljs
 * Postgres-implementationen via getStores() när DATABASE_URL är satt.
 */

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
  private results: ResultRecord[] = [];
  private comments: CommentRecord[] = [];
  private consents: ConsentRecord[] = [];

  async saveResult(r: ResultRecord): Promise<void> {
    this.results.push(r);
  }
  async saveComment(c: CommentRecord): Promise<void> {
    this.comments.push(c);
  }
  async logConsent(c: ConsentRecord): Promise<void> {
    this.consents.push(c);
  }
  async hasConsent(sessionId: string, type: ConsentType): Promise<boolean> {
    // Senast loggade samtycke för (session, typ) avgör. Vid samma createdAt
    // avgör inläggningsordningen (sista vinner) — speglar Postgres ', id DESC'.
    // Obs: i dag finns ingen återkallandeväg för article9_freetext, så detta är
    // tills vidare endast latent (samma intent dokumenteras i postgres.ts).
    let latest: ConsentRecord | undefined;
    for (const c of this.consents) {
      if (c.sessionId === sessionId && c.type === type) {
        if (!latest || c.createdAt >= latest.createdAt) latest = c;
      }
    }
    return latest?.granted ?? false;
  }
  async purgeExpired(now: string): Promise<number> {
    const before = this.comments.length + this.results.length;
    this.comments = this.comments.filter((c) => c.deleteAfter > now);
    this.results = this.results.filter((r) => r.deleteAfter > now);
    return before - this.comments.length - this.results.length;
  }

  async deleteBySession(sessionId: string): Promise<number> {
    const before = this.results.length + this.comments.length + this.consents.length;
    this.results = this.results.filter((r) => r.sessionId !== sessionId);
    this.comments = this.comments.filter((c) => c.sessionId !== sessionId);
    this.consents = this.consents.filter((c) => c.sessionId !== sessionId);
    return before - (this.results.length + this.comments.length + this.consents.length);
  }

  async exportBySession(sessionId: string): Promise<SessionExport> {
    return {
      results: this.results.filter((r) => r.sessionId === sessionId),
      comments: this.comments.filter((c) => c.sessionId === sessionId),
      consents: this.consents.filter((c) => c.sessionId === sessionId),
    };
  }

  /** Testhjälp: läsvy över lagrade kommentarer (ersätter borttagna listComments). */
  _commentsForTest(): readonly CommentRecord[] {
    return [...this.comments];
  }
}
