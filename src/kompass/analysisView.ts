/**
 * Rena presentationshjälpare för AI-tolkningens klient-UI:
 *  - sentiment på svenska,
 *  - teckenräknare för kommentarfält (visas först nära maxgränsen),
 *  - läsbar sammanfattning av uteslutna kommentarer (nämner frågan, aldrig texten).
 */

import type { Sentiment } from "../analysis/types.ts";

/** Maxlängd per kommentar – speglar serverns gräns i analyze-pipelinen. */
export const MAX_COMMENT_LENGTH = 2000;
/** Räknaren visas först när texten närmar sig maxgränsen. */
export const COUNTER_THRESHOLD = 1600;

const SENTIMENT_SV: Record<Sentiment, string> = {
  positive: "positiv",
  negative: "negativ",
  neutral: "neutral",
  mixed: "blandad",
};

/** Sentiment på svenska; null för okända värden (raden döljs då). */
export function sentimentLabel(sentiment: string): string | null {
  return (SENTIMENT_SV as Record<string, string>)[sentiment] ?? null;
}

/** Svensk tusentalsgruppering med hårt mellanslag: 1823 → "1 823". */
function groupSv(n: number): string {
  const s = String(Math.max(0, Math.trunc(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += " ";
  }
  return out;
}

/**
 * Etikett för teckenräknaren, t.ex. "1 823/2 000". Returnerar null under
 * tröskeln så att räknaren inte stör medan gott om utrymme finns.
 */
export function charCounterLabel(
  length: number,
  max: number = MAX_COMMENT_LENGTH,
  threshold: number = COUNTER_THRESHOLD,
): string | null {
  if (length <= threshold) return null;
  return `${groupSv(length)}/${groupSv(max)}`;
}

/**
 * Sammanfattar vilka kommentarer som uteslöts ur tolkningen, med frågetext
 * (aldrig kommentartext). null när inget uteslöts.
 */
export function excludedCommentSummary(
  excluded: readonly { questionId: string | null }[],
  questionTextById: Readonly<Record<string, string>>,
): string | null {
  if (excluded.length === 0) return null;
  const labels = excluded.map((e) =>
    e.questionId
      ? `kommentaren på frågan "${questionTextById[e.questionId] ?? e.questionId}"`
      : "den övergripande kommentaren",
  );
  const joined =
    labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} och ${labels[labels.length - 1]!}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} vägdes inte in i tolkningen.`;
}
