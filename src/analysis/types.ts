/**
 * Typer för det additiva AI-lagret: tolkning av användarens fritextkommentar.
 *
 * Detta lager ÄNDRAR ALDRIG matchningssiffran (som är deterministisk kod). Det
 * tillför nyans, teman och kopplingar, märkt som AI-genererat. Structured
 * Outputs garanterar formen; logga prompt-/schema-version + input-hash per körning.
 */

import type { Dimension } from "../matching/types.ts";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Leaning = "left" | "right" | "gal" | "tan" | "unclear";

export interface PolicySignal {
  readonly dimension: Dimension | "none";
  readonly leaning: Leaning;
  readonly note: string;
}

export interface CommentAnalysis {
  readonly summary: string;
  readonly themes: readonly string[];
  readonly sentiment: Sentiment;
  /** Frågor (id) som kommentaren tycks beröra. */
  readonly relatedQuestionIds: readonly string[];
  readonly policySignals: readonly PolicySignal[];
  /** true = olämpligt/skadligt innehåll; ska inte visas eller vägas in. */
  readonly flagged: boolean;
  readonly flagReason: string;
}

export interface AnalyzeInput {
  readonly comment: string;
  readonly questionId?: string;
  readonly topMatches: readonly { partyId: string; partyName: string; percent: number | null }[];
  readonly questions: readonly { id: string; text: string }[];
}

export interface CommentAnalyzer {
  analyze(input: AnalyzeInput): Promise<CommentAnalysis>;
}

/** Prompt-/schema-version att logga tillsammans med varje analys. */
export const ANALYSIS_SCHEMA_VERSION = "1";

/** JSON Schema för Structured Outputs (alla fält required, additionalProperties:false). */
export const COMMENT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    themes: { type: "array", items: { type: "string" } },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "mixed"] },
    relatedQuestionIds: { type: "array", items: { type: "string" } },
    policySignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["economic", "galtan", "none"] },
          leaning: { type: "string", enum: ["left", "right", "gal", "tan", "unclear"] },
          note: { type: "string" },
        },
        required: ["dimension", "leaning", "note"],
        additionalProperties: false,
      },
    },
    flagged: { type: "boolean" },
    flagReason: { type: "string" },
  },
  required: ["summary", "themes", "sentiment", "relatedQuestionIds", "policySignals", "flagged", "flagReason"],
  additionalProperties: false,
} as const;
