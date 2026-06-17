/**
 * Förslagslogik: hämta belägg → låt modellen föreslå en partiposition med citat.
 *
 * Resultatet är ALLTID ett utkast (status draft). En människa godkänner sedan
 * via catalog.approvePosition (som kräver minst ett citat). Modellen beslutar
 * aldrig den slutgiltiga siffran.
 */

import type { PartyPosition, SourceRef } from "../catalog/types.ts";
import type { Scale } from "../matching/types.ts";
import type { PositionProposer, ProposedPosition } from "../ai/types.ts";
import type { Retriever } from "./retriever.ts";

export interface ProposeArgs {
  readonly questionId: string;
  readonly questionText: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly scale: Scale;
  readonly retriever: Retriever;
  readonly proposer: PositionProposer;
  readonly k?: number;
}

const clamp = (v: number, s: Scale) => Math.max(s.min, Math.min(s.max, v));

export async function proposeDraftPosition(
  args: ProposeArgs,
): Promise<{ position: PartyPosition; proposal: ProposedPosition }> {
  const context = await args.retriever.retrieve(
    `${args.questionText} ${args.partyName}`,
    args.k ?? 6,
    args.partyId,
  );

  const proposal = await args.proposer.propose({
    questionId: args.questionId,
    questionText: args.questionText,
    partyId: args.partyId,
    partyName: args.partyName,
    scale: args.scale,
    context,
  });

  // Säkra att utkastet bär belägg även om modellen inte ekade tillbaka citat.
  const citations: readonly SourceRef[] =
    proposal.citations.length > 0 ? proposal.citations : context.map((c) => c.doc.source);

  const position: PartyPosition = {
    questionId: args.questionId,
    partyId: args.partyId,
    value: clamp(proposal.value, args.scale),
    citations,
    status: "draft",
  };

  return { position, proposal };
}
