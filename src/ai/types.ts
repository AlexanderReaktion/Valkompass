/**
 * AI-gränssnitt för admin-sidans positionsförslag (RAG).
 * Implementeras av Anthropic-klienten; fakas i tester.
 */

import type { SourceRef } from "../catalog/types.ts";
import type { RetrievedChunk } from "../rag/retriever.ts";
import type { Scale } from "../matching/types.ts";

export interface ProposePositionInput {
  readonly questionId: string;
  readonly questionText: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly scale: Scale;
  /** Hämtat belägg som modellen ska grunda förslaget på. */
  readonly context: readonly RetrievedChunk[];
}

export interface ProposedPosition {
  /** Föreslaget kanoniskt värde på skalan (högre = mer höger/TAN). */
  readonly value: number;
  /** Modellens säkerhet 0–1. */
  readonly confidence: number;
  /** Belägg modellen stöder sig på (delmängd av context). */
  readonly citations: readonly SourceRef[];
  readonly reasoning: string;
}

export interface PositionProposer {
  propose(input: ProposePositionInput): Promise<ProposedPosition>;
}
