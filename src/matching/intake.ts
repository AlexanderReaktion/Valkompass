/**
 * Intag: konvertera användarens svar på den VISADE frågeformuleringen till
 * kanoniska värden som matchningsmotorn arbetar med.
 *
 * Varför: för att dämpa partiledtråd och ja-sägartendens varierar vi medvetet
 * åt vilket håll "instämmer" pekar (se docs/fragor-riktlinjer.md). En fråga med
 * polarity = -1 är omvänt formulerad — användarens svar speglas kring skalans
 * mitt här, EN gång, så att allt nedströms (matchning, 2D-karta, lagring) är
 * konsekvent kanoniskt. Motorn behöver aldrig känna till polariteten.
 */

import type { Polarity, Question, Scale, UserAnswer, UserAnswers } from "./types.ts";

export interface DisplayAnswer {
  /** Svar på den visade formuleringen. null = "vet ej"/obesvarad. */
  readonly value: number | null;
  readonly weight?: number;
}

/** Användarens råa svar, nycklade på questionId, i visningsrymden. */
export type DisplayAnswers = Readonly<Record<string, DisplayAnswer>>;

const midpoint = (scale: Scale): number => (scale.max + scale.min) / 2;

/** Spegla ett visningsvärde till kanoniskt värde utifrån frågans polaritet. */
export function toCanonicalValue(displayValue: number, polarity: Polarity, scale: Scale): number {
  if (polarity === 1) return displayValue;
  return 2 * midpoint(scale) - displayValue; // spegling kring mitten (fungerar även för asymmetriska skalor)
}

/**
 * Konvertera en hel uppsättning visningssvar till kanoniska UserAnswers.
 * Bara frågor som finns i `questions` tas med (okända id:n ignoreras tyst).
 */
export function toCanonicalAnswers(
  display: DisplayAnswers,
  questions: readonly Question[],
  scale: Scale,
): UserAnswers {
  const out: Record<string, UserAnswer> = {};
  for (const q of questions) {
    const d = display[q.id];
    if (!d) continue;
    const polarity = q.polarity ?? 1;
    const value = d.value === null ? null : toCanonicalValue(d.value, polarity, scale);
    out[q.id] = d.weight === undefined ? { value } : { value, weight: d.weight };
  }
  return out;
}
