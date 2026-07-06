/**
 * Orkestrering av fritextanalysen. Bygger en kompakt, pseudonymiserad input
 * (ingen identifierare – bara kommentarer + skalsvar i ord + topplista +
 * frågelista) och delegerar till en CommentAnalyzer (Anthropic i produktion,
 * fake i test). Sanering av modellens id-referenser görs också här.
 */

import type { Coordinates, RankedResult, Scale } from "../matching/types.ts";
import type { DisplayAnswers } from "../matching/intake.ts";
import { stanceLabel } from "../kompass/stance.ts";
import type { AnalyzeInput, AnsweredQuestion, CommentAnalysis, CommentAnalyzer, CommentItem } from "./types.ts";

export interface AnalyzeArgs {
  /** Per-fråga-kommentarer + ev. övergripande. Tomma trimmas bort. */
  readonly comments: readonly CommentItem[];
  readonly ranking: RankedResult;
  readonly questions: readonly { id: string; text: string }[];
  readonly analyzer: CommentAnalyzer;
  readonly topN?: number;
  /** Väljarens skalsvar i ord (hållning + vikt), för grundade tolkningar. */
  readonly answers?: readonly AnsweredQuestion[];
  /** Väljarens 2D-position per axel, normerad till [-1, 1]. */
  readonly userCoordinates?: Coordinates;
  /** Per-dimension-matchning per partyId för topplistan (från matchPartyByDimension). */
  readonly partyDimensions?: Readonly<Record<string, { economic: number | null; galtan: number | null }>>;
}

/** Bygger analysinputen (utan att anropa modellen). Kastar när inga kommentarer finns. */
export function buildAnalyzeInput(args: Omit<AnalyzeArgs, "analyzer">): AnalyzeInput {
  const comments = args.comments
    .map((c) => ({ ...c, text: c.text.trim() }))
    .filter((c) => c.text.length > 0);
  if (comments.length === 0) throw new Error("Inga kommentarer att analysera.");

  const topMatches = args.ranking.matches.slice(0, args.topN ?? 3).map((m) => {
    const dims = args.partyDimensions?.[m.partyId];
    return {
      partyId: m.partyId,
      partyName: m.partyName,
      percent: m.percent,
      ...(dims ? { economicPercent: dims.economic, galtanPercent: dims.galtan } : {}),
    };
  });

  return {
    comments,
    answers: args.answers ?? [],
    topMatches,
    ...(args.userCoordinates ? { userCoordinates: args.userCoordinates } : {}),
    questions: args.questions,
  };
}

export async function analyzeComment(args: AnalyzeArgs): Promise<CommentAnalysis> {
  return args.analyzer.analyze(buildAnalyzeInput(args));
}

export interface AnswerSummaryArgs {
  /** Användarens svar i visningsrymden (null = "vet ej"). */
  readonly display: DisplayAnswers;
  /** Frågor i katalogordning (ger deterministisk prompt). Bara besvarade tas med. */
  readonly questions: readonly { id: string; text: string }[];
  readonly scale: Scale;
  readonly commentedQuestionIds?: ReadonlySet<string>;
}

/**
 * Skalsvar i ord för prompten. stanceLabel anropas med polaritet 1 eftersom
 * värdet redan är i visningsrymden – orden gäller exakt den formulering
 * användaren såg. null-värde blir "vet ej".
 */
export function buildAnswerSummaries(args: AnswerSummaryArgs): AnsweredQuestion[] {
  const out: AnsweredQuestion[] = [];
  for (const q of args.questions) {
    const d = args.display[q.id];
    if (!d) continue;
    out.push({
      questionId: q.id,
      questionText: q.text,
      stance: d.value === null ? "vet ej" : stanceLabel(d.value, 1, args.scale),
      weight: d.weight ?? 1,
      hasComment: args.commentedQuestionIds?.has(q.id) ?? false,
    });
  }
  return out;
}

/**
 * Sanera modellens id-referenser server-side: okända fråge-id:n filtreras tyst,
 * commentFlags utanför [1..commentCount] (eller dubbletter) tas bort. Modellen
 * får aldrig smuggla in id:n som inte finns i katalogen.
 */
export function sanitizeAnalysis(
  analysis: CommentAnalysis,
  validQuestionIds: ReadonlySet<string>,
  commentCount: number,
): CommentAnalysis {
  const keep = (id: string): boolean => validQuestionIds.has(id);

  const seen = new Set<number>();
  const commentFlags = (analysis.commentFlags ?? []).filter((f) => {
    if (!Number.isInteger(f.commentIndex) || f.commentIndex < 1 || f.commentIndex > commentCount) return false;
    if (seen.has(f.commentIndex)) return false;
    seen.add(f.commentIndex);
    return true;
  });

  return {
    ...analysis,
    relatedQuestionIds: analysis.relatedQuestionIds.filter(keep),
    commentInfluences: analysis.commentInfluences.map((ci) => {
      const { sourceQuestionId, ...rest } = ci;
      const affectedQuestionIds = ci.affectedQuestionIds.filter(keep);
      return sourceQuestionId !== undefined && keep(sourceQuestionId)
        ? { ...rest, sourceQuestionId, affectedQuestionIds }
        : { ...rest, affectedQuestionIds };
    }),
    commentFlags,
  };
}

/** Flaggat innehåll ska varken visas eller vägas in. */
export const isPresentable = (a: CommentAnalysis): boolean => !a.flagged;
