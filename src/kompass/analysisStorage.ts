/**
 * Klientlokal lagring av AI-tolkningen (localStorage) + fingeravtryck för
 * stale-detektering.
 *
 * Designval:
 *  - Kommentarer är art. 9-data och sparas lokalt FÖRST efter att användaren
 *    skickat in dem med uttryckligt samtycke (samma försiktighetsprincip som
 *    kompass-history-v1: enbart användarens egen enhet, aldrig i URL:en).
 *  - Fingeravtrycken är deterministiska (sorterade nycklar) så att samma
 *    svar+kommentarer alltid ger samma avtryck, oavsett insättningsordning.
 *  - parse är defensiv som decodeRunState: trasig/okänd payload ger null.
 */

import type { CommentAnalysis } from "../analysis/types.ts";

export const ANALYSIS_STORE_VERSION = 1 as const;
export const ANALYSIS_STORE_KEY = "kompass-analysis-v1";
/** Nyckeln för den beständiga sessionsreferensen (delas med Kompass och raderingssidan). */
export const SESSION_STORAGE_KEY = "kompass-session";

/** Visningssvar: [värde eller null (= vet ej), vikt] – samma form som permalänken. */
export type AnswerTuple = readonly [number | null, number];

export interface StoredAnalysis {
  readonly version: typeof ANALYSIS_STORE_VERSION;
  readonly sessionId: string;
  readonly runId: string | null;
  /** Avtryck av enbart svaren – för matchning mot permalänkens svar vid återställning. */
  readonly answersFingerprint: string;
  /** Avtryck av svar + kommentarer vid analystillfället – för stale-detektering. */
  readonly runFingerprint: string;
  readonly comments: Readonly<Record<string, string>>;
  readonly overallComment: string;
  readonly analysis: CommentAnalysis | null;
  readonly analysisNote: string | null;
  readonly excludedComments: readonly { questionId: string | null }[];
  /** Katalogversion (PublishedCatalog.version) som analysen skapades mot. */
  readonly catalogVersion: number;
  readonly timestamp: string;
}

function sortedAnswerRows(answers: Readonly<Record<string, AnswerTuple>>): (string | number | null)[][] {
  return Object.keys(answers)
    .sort()
    .map((id) => [id, answers[id]![0], answers[id]![1]]);
}

/** Deterministiskt avtryck av svaren (id, värde, vikt), oberoende av nyckelordning. */
export function answersFingerprint(answers: Readonly<Record<string, AnswerTuple>>): string {
  return JSON.stringify(sortedAnswerRows(answers));
}

/**
 * Deterministiskt avtryck av hela analysunderlaget: svar + trimmade icke-tomma
 * frågekommentarer + övergripande kommentar. Ändras något av detta är en
 * tidigare analys inaktuell (stale).
 */
export function runFingerprint(
  answers: Readonly<Record<string, AnswerTuple>>,
  comments: Readonly<Record<string, string>>,
  overallComment: string,
): string {
  const c = Object.entries(comments)
    .map(([id, t]) => [id, t.trim()] as const)
    .filter(([, t]) => t.length > 0)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return JSON.stringify({ a: sortedAnswerRows(answers), c, o: overallComment.trim() });
}

/** Stale = analysen skapades på ett annat underlag än det som visas nu. */
export function isAnalysisStale(analysisFingerprint: string | null, currentFingerprint: string): boolean {
  return analysisFingerprint !== null && analysisFingerprint !== currentFingerprint;
}

export function serializeStoredAnalysis(stored: StoredAnalysis): string {
  return JSON.stringify(stored);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isCommentAnalysis(v: unknown): v is CommentAnalysis {
  if (!isRecord(v)) return false;
  if (typeof v.summary !== "string" || typeof v.sentiment !== "string") return false;
  if (typeof v.flagged !== "boolean" || typeof v.flagReason !== "string") return false;
  if (!isStringArray(v.themes) || !isStringArray(v.relatedQuestionIds)) return false;
  if (
    !Array.isArray(v.policySignals) ||
    !v.policySignals.every(
      (s) => isRecord(s) && typeof s.dimension === "string" && typeof s.leaning === "string" && typeof s.note === "string",
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(v.commentInfluences) ||
    !v.commentInfluences.every(
      (i) =>
        isRecord(i) &&
        isStringArray(i.affectedQuestionIds) &&
        typeof i.effect === "string" &&
        typeof i.note === "string" &&
        (i.sourceQuestionId === undefined || typeof i.sourceQuestionId === "string"),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(v.commentFlags) ||
    !v.commentFlags.every((f) => isRecord(f) && typeof f.commentIndex === "number" && typeof f.reason === "string")
  ) {
    return false;
  }
  return true;
}

/** Avkoda en sparad analys. Returnerar null för allt som inte validerar. */
export function parseStoredAnalysis(raw: string | null): StoredAnalysis | null {
  if (!raw || raw.length > 500_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== ANALYSIS_STORE_VERSION) return null;
  if (typeof parsed.sessionId !== "string") return null;
  if (parsed.runId !== null && typeof parsed.runId !== "string") return null;
  if (typeof parsed.answersFingerprint !== "string" || typeof parsed.runFingerprint !== "string") return null;
  if (!isRecord(parsed.comments) || !Object.values(parsed.comments).every((t) => typeof t === "string")) return null;
  if (typeof parsed.overallComment !== "string") return null;
  if (parsed.analysis !== null && !isCommentAnalysis(parsed.analysis)) return null;
  if (parsed.analysisNote !== null && typeof parsed.analysisNote !== "string") return null;
  if (
    !Array.isArray(parsed.excludedComments) ||
    !parsed.excludedComments.every((e) => isRecord(e) && (e.questionId === null || typeof e.questionId === "string"))
  ) {
    return null;
  }
  if (typeof parsed.catalogVersion !== "number" || typeof parsed.timestamp !== "string") return null;
  return parsed as unknown as StoredAnalysis;
}
