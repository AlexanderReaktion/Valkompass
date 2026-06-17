/** En researchad partiposition (utkast) för 2026-katalogen. */
export interface PositionRow {
  /** questionId enligt catalog2026 QDEFS. */
  readonly q: string;
  /** Kanoniskt värde -2..2 (högre = höger / TAN / för). */
  readonly v: number;
  /** Citat-label (källa). */
  readonly l: string;
  /** Citat-url (riktig primärkälla). */
  readonly u: string;
}
