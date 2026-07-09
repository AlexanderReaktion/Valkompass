/**
 * Frågekatalogens domäntyper.
 *
 * Livscykel: draft → approved → (publicerad i en fryst, versionerad katalog).
 * Allt serveras från en PublishedCatalog som är frusen per valomgång — frågor
 * genereras/granskas offline (human-in-the-loop), aldrig live mot användare.
 */

import type { Dimension, Polarity, Scale } from "../matching/types.ts";

/** Dynamisk = aktuell sakfråga; strukturell = genomsyrande skiljelinje. */
export type QuestionKind = "dynamic" | "structural";

export type LifecycleStatus = "draft" | "approved" | "archived";

export interface SourceRef {
  /** T.ex. "Riksdagen votering 2025/26:123" eller "Partiprogram (S) 2025, s.12". */
  readonly label: string;
  readonly url?: string;
}

export interface CatalogQuestion {
  readonly id: string;
  readonly kind: QuestionKind;
  /** Den VISADE formuleringen (på svenska). */
  readonly text: string;
  /** Strukturell axel för 2D-kartan. Saknas = ingen kartaxel. */
  readonly dimension?: Dimension;
  /** Visningspolaritet (1 | -1). Varieras medvetet för att dämpa partiledtråd. */
  readonly polarity: Polarity;
  /** Ämne, t.ex. "sjukvård", "migration". */
  readonly topic: string;
  readonly status: LifecycleStatus;
  /** Publik användartext om varför frågan valts — krävs för godkännande, visas för användaren. */
  readonly rationale?: string;
  readonly sources: readonly SourceRef[];
  readonly createdAt: string; // ISO 8601
  readonly approvedBy?: string;
  readonly approvedAt?: string; // ISO 8601
}

export interface PartyPosition {
  readonly questionId: string;
  readonly partyId: string;
  /** Godkänt kanoniskt värde på skalan (av-polariserat). */
  readonly value: number;
  /** Obligatoriskt textbelägg (partiprogram/votering) — minst ett vid godkännande. */
  readonly citations: readonly SourceRef[];
  readonly status: LifecycleStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: string; // ISO 8601
}

export interface PublishedCatalog {
  readonly version: number;
  readonly election: string; // t.ex. "riksdagsval-2026"
  readonly publishedAt: string; // ISO 8601
  readonly scale: Scale;
  readonly questions: readonly CatalogQuestion[]; // endast approved, frusna
}

export interface ValidationResult {
  readonly ok: boolean;
  /** Blockerar publicering. */
  readonly errors: readonly string[];
  /** Rekommendationer (blockerar inte). */
  readonly warnings: readonly string[];
}
