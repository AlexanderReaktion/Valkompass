/**
 * Tjänstelager kring ResponseStore: samtyckesgrind + retention.
 *
 * Fritextkommentarer (känsliga art. 9-data) får lagras ENDAST med uttryckligt
 * samtycke, och gallras automatiskt efter valdagen. Tidsstämplar och id:n
 * injiceras (now, genId) för deterministisk, testbar logik.
 */

import type { CommentRecord, ConsentType, ResponseStore } from "./types.ts";

/** Svenska riksdagsvalet 2026. Kommentarer gallras efter detta datum. */
export const ELECTION_DAY = "2026-09-13";

/** Kommentarer raderas efter valdagen (slutet av valdagen, UTC). */
export function retentionDeadline(electionDay: string = ELECTION_DAY): string {
  return `${electionDay}T23:59:59.999Z`;
}

export class ConsentMissingError extends Error {
  constructor(sessionId: string) {
    super(`Saknar uttryckligt samtycke (art. 9) för session ${sessionId} — kommentar lagras inte.`);
    this.name = "ConsentMissingError";
  }
}

export interface GrantConsentInput {
  readonly sessionId: string;
  readonly type: ConsentType;
  readonly granted: boolean;
  readonly bannerVersion: string;
  readonly now: string;
  readonly genId: () => string;
}

export async function grantConsent(store: ResponseStore, input: GrantConsentInput): Promise<void> {
  await store.logConsent({
    id: input.genId(),
    sessionId: input.sessionId,
    type: input.type,
    granted: input.granted,
    bannerVersion: input.bannerVersion,
    createdAt: input.now,
  });
}

export interface StoreCommentInput {
  readonly sessionId: string;
  readonly text: string;
  readonly questionId?: string;
  readonly analysis?: unknown;
  readonly now: string;
  readonly electionDay?: string;
  readonly genId: () => string;
}

/**
 * Lagrar en kommentar — kräver att art. 9-samtycke redan loggats för sessionen.
 * Kastar ConsentMissingError annars (kommentaren ska då bara analyseras in-flight).
 */
export async function storeComment(store: ResponseStore, input: StoreCommentInput): Promise<CommentRecord> {
  const ok = await store.hasConsent(input.sessionId, "article9_freetext");
  if (!ok) throw new ConsentMissingError(input.sessionId);

  const record: CommentRecord = {
    id: input.genId(),
    sessionId: input.sessionId,
    ...(input.questionId ? { questionId: input.questionId } : {}),
    text: input.text,
    createdAt: input.now,
    deleteAfter: retentionDeadline(input.electionDay),
    ...(input.analysis !== undefined ? { analysis: input.analysis } : {}),
  };
  await store.saveComment(record);
  return record;
}
