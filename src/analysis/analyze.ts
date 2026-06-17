/**
 * Orkestrering av fritextanalysen. Bygger en kompakt, pseudonymiserad input
 * (ingen identifierare — bara kommentartext + topplista + frågelista) och
 * delegerar till en CommentAnalyzer (Anthropic i produktion, fake i test).
 */

import type { RankedResult } from "../matching/types.ts";
import type { CommentAnalysis, CommentAnalyzer, CommentItem } from "./types.ts";

export interface AnalyzeArgs {
  /** Per-fråga-kommentarer + ev. övergripande. Tomma trimmas bort. */
  readonly comments: readonly CommentItem[];
  readonly ranking: RankedResult;
  readonly questions: readonly { id: string; text: string }[];
  readonly analyzer: CommentAnalyzer;
  readonly topN?: number;
}

export async function analyzeComment(args: AnalyzeArgs): Promise<CommentAnalysis> {
  const comments = args.comments
    .map((c) => ({ ...c, text: c.text.trim() }))
    .filter((c) => c.text.length > 0);
  if (comments.length === 0) throw new Error("Inga kommentarer att analysera.");

  const topMatches = args.ranking.matches
    .slice(0, args.topN ?? 3)
    .map((m) => ({ partyId: m.partyId, partyName: m.partyName, percent: m.percent }));

  return args.analyzer.analyze({ comments, topMatches, questions: args.questions });
}

/** Flaggat innehåll ska varken visas eller vägas in. */
export const isPresentable = (a: CommentAnalysis): boolean => !a.flagged;
