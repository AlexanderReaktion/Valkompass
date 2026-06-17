/**
 * Orkestrering av fritextanalysen. Bygger en kompakt, pseudonymiserad input
 * (ingen identifierare — bara kommentartext + topplista + frågelista) och
 * delegerar till en CommentAnalyzer (Anthropic i produktion, fake i test).
 */

import type { RankedResult } from "../matching/types.ts";
import type { AnalyzeInput, CommentAnalysis, CommentAnalyzer } from "./types.ts";

export interface AnalyzeArgs {
  readonly comment: string;
  readonly questionId?: string;
  readonly ranking: RankedResult;
  readonly questions: readonly { id: string; text: string }[];
  readonly analyzer: CommentAnalyzer;
  readonly topN?: number;
}

export async function analyzeComment(args: AnalyzeArgs): Promise<CommentAnalysis> {
  const comment = args.comment.trim();
  if (!comment) throw new Error("Tom kommentar – inget att analysera.");

  const topMatches = args.ranking.matches
    .slice(0, args.topN ?? 3)
    .map((m) => ({ partyId: m.partyId, partyName: m.partyName, percent: m.percent }));

  const input: AnalyzeInput = {
    comment,
    ...(args.questionId ? { questionId: args.questionId } : {}),
    topMatches,
    questions: args.questions,
  };

  return args.analyzer.analyze(input);
}

/** Flaggat innehåll ska varken visas eller vägas in. */
export const isPresentable = (a: CommentAnalysis): boolean => !a.flagged;
