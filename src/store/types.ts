/**
 * Persistenslagrets typer och gränssnitt.
 *
 * Designprincip (GDPR): identitet skild från innehåll. Resultat (skalsvar +
 * matchning) lagras utan direkt identifierare; fritextkommentarer (känsliga
 * art. 9-data) lagras separat, kopplade via ett slumpmässigt session-UUID,
 * endast med uttryckligt samtycke, och gallras automatiskt efter valdagen.
 */

import type { CatalogQuestion, PartyPosition, PublishedCatalog } from "../catalog/types.ts";

export type ConsentType = "article9_freetext" | "cookies";

/** Resultat: skalsvar + matchning. Ingen direkt identifierare. */
export interface ResultRecord {
  readonly id: string; // slumpmässigt resultat-UUID
  readonly sessionId: string; // slumpmässigt session-UUID (kopplar ev. kommentar), ej IP/e-post
  readonly catalogVersion: number;
  readonly method: string;
  /** Kanoniska svar (av-polariserade) för reproducerbarhet. */
  readonly canonicalAnswers: Readonly<Record<string, { value: number | null; weight: number }>>;
  /** Serialiserad matchning (topplista m.m.) för reproducerbarhet. */
  readonly ranking: unknown;
  readonly createdAt: string; // ISO 8601
  readonly deleteAfter: string; // ISO 8601 — auto-gallras efter detta
}

/** Fritextkommentar — känslig art. 9-data. */
export interface CommentRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly questionId?: string; // null/utelämnad = övergripande kommentar
  readonly text: string;
  readonly createdAt: string; // ISO 8601
  readonly deleteAfter: string; // ISO 8601 — auto-gallras efter detta
  /** Additivt AI-lager (kan regenereras; ändrar aldrig matchningssiffran). */
  readonly analysis?: unknown;
}

export interface ConsentRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly type: ConsentType;
  readonly granted: boolean;
  readonly bannerVersion: string;
  readonly createdAt: string; // ISO 8601
}

/**
 * Sparad AI-analys – härledd ur fritext (art. 9-data), samma samtyckeskrav
 * och gallring som kommentarerna. Regenererbar; ändrar aldrig matchningssiffran.
 */
export interface AnalysisRecord {
  readonly id: string;
  readonly sessionId: string;
  /** Prompt-/schemaversion (ANALYSIS_SCHEMA_VERSION) för reproducerbarhet. */
  readonly schemaVersion: string;
  /** sha-256 (hex) av exakta user-prompten som gav analysen. */
  readonly inputHash: string;
  readonly model: string;
  /** CommentAnalysis-JSON, presentabel eller flaggad. */
  readonly analysis: unknown;
  readonly createdAt: string; // ISO 8601
  readonly deleteAfter: string; // ISO 8601 – auto-gallras efter detta
}

/** Katalog: publicerade (frysta) kataloger + admin-utkast. */
export interface CatalogStore {
  getPublished(election: string): Promise<PublishedCatalog | null>;
  savePublished(catalog: PublishedCatalog): Promise<void>;
  saveQuestion(question: CatalogQuestion): Promise<void>;
  listQuestions(): Promise<CatalogQuestion[]>;
  savePosition(position: PartyPosition): Promise<void>;
  listPositions(): Promise<PartyPosition[]>;
}

/** Allt som hör till en session (DSAR-export, art. 15 GDPR). */
export interface SessionExport {
  readonly results: ResultRecord[];
  readonly comments: CommentRecord[];
  readonly consents: ConsentRecord[];
  readonly analyses: AnalysisRecord[];
}

/**
 * Svar, kommentarer, samtycke och analyser. save*-metoderna är replay-toleranta:
 * en rad med redan förekommande id ignoreras tyst (Postgres: ON CONFLICT (id)
 * DO NOTHING), så idempotenta omkörningar med samma runId inte dubblerar rader.
 */
export interface ResponseStore {
  saveResult(record: ResultRecord): Promise<void>;
  saveComment(record: CommentRecord): Promise<void>;
  logConsent(record: ConsentRecord): Promise<void>;
  saveAnalysis(record: AnalysisRecord): Promise<void>;
  /** Senast loggade samtycke för (session, typ) avgör. */
  hasConsent(sessionId: string, type: ConsentType): Promise<boolean>;
  /** Tar bort kommentarer, resultat och analyser vars deleteAfter passerat. Returnerar antal borttagna. */
  purgeExpired(now: string): Promise<number>;
  /**
   * DSAR – radering (art. 17): tar bort resultat, kommentarer, analyser och
   * samtyckeslogg för sessionen. Returnerar totalt antal borttagna rader.
   */
  deleteBySession(sessionId: string): Promise<number>;
  /** DSAR — export (art. 15): allt lagrat för sessionen. */
  exportBySession(sessionId: string): Promise<SessionExport>;
}
