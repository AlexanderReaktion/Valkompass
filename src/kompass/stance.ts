/**
 * Hållning i ord: översätter ett KANONISKT värde till vad det betyder för den
 * VISADE frågeformuleringen ("instämmer helt" … "tar helt avstånd").
 *
 * Speglingen görs här (en gång) så att resultatsidan kan säga "SD: instämmer
 * delvis" om exakt det påstående användaren såg — även för spegelvända frågor.
 */

import type { Polarity, Scale } from "../matching/types.ts";

export type StanceLabel =
  | "tar helt avstånd"
  | "tar delvis avstånd"
  | "neutral/splittrad"
  | "instämmer delvis"
  | "instämmer helt";

export function stanceLabel(canonicalValue: number, polarity: Polarity, scale: Scale): StanceLabel {
  const mid = (scale.max + scale.min) / 2;
  const half = (scale.max - scale.min) / 2;
  const display = polarity === 1 ? canonicalValue : 2 * mid - canonicalValue;
  const t = Math.max(-1, Math.min(1, (display - mid) / half));
  if (t >= 0.75) return "instämmer helt";
  if (t >= 0.25) return "instämmer delvis";
  if (t > -0.25) return "neutral/splittrad";
  if (t > -0.75) return "tar delvis avstånd";
  return "tar helt avstånd";
}
