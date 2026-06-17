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
} from "./types.ts";

export class MemoryCatalogStore implements CatalogStore {
  private published = new Map<string, PublishedCatalog>();
  private questions = new Map<string, CatalogQuestion>();
  private positions = new Map<string, PartyPosition>();

  async getPublished(election: string): Promise<PublishedCatalog | null> {
    return this.published.get(election) ?? null;
  }
  async savePublished(catalog: PublishedCatalog): Promise<void> {
    this.published.set(catalog.election, catalog);
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
    // Senast loggade samtycke för (session, typ) avgör.
    let latest: ConsentRecord | undefined;
    for (const c of this.consents) {
      if (c.sessionId === sessionId && c.type === type) {
        if (!latest || c.createdAt >= latest.createdAt) latest = c;
      }
    }
    return latest?.granted ?? false;
  }
  async listComments(): Promise<CommentRecord[]> {
    return [...this.comments];
  }
  async purgeExpired(now: string): Promise<number> {
    const before = this.comments.length;
    this.comments = this.comments.filter((c) => c.deleteAfter > now);
    return before - this.comments.length;
  }
}
