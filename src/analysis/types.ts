/**
 * Typer för det additiva AI-lagret: tolkning av användarens fritextkommentar.
 *
 * Detta lager ÄNDRAR ALDRIG matchningssiffran (som är deterministisk kod). Det
 * tillför nyans, teman och kopplingar, märkt som AI-genererat. Structured
 * Outputs garanterar formen; logga prompt-/schema-version + input-hash per körning.
 */

import type { Coordinates, Dimension } from "../matching/types.ts";
import type { StanceLabel } from "../kompass/stance.ts";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Leaning = "left" | "right" | "gal" | "tan" | "unclear";

export interface PolicySignal {
  readonly dimension: Dimension | "none";
  readonly leaning: Leaning;
  readonly note: string;
}

export type CommentInfluenceEffect = "reinforces_answer" | "nuances_answer" | "adds_priority" | "signals_tension" | "unclear";

export interface CommentInfluence {
  /** Frågan kommentaren skrevs på. Saknas för övergripande kommentar. */
  readonly sourceQuestionId?: string;
  /** Frågor som AI-tolkningen kopplade kommentaren till. */
  readonly affectedQuestionIds: readonly string[];
  readonly effect: CommentInfluenceEffect;
  readonly note: string;
}

/** En enskild olämplig kommentar som utesluts ur analysen. */
export interface CommentFlag {
  /** 1-baserat: kommentarens nummer i den numrerade listan i prompten. */
  readonly commentIndex: number;
  readonly reason: string;
}

export interface CommentAnalysis {
  readonly summary: string;
  readonly themes: readonly string[];
  readonly sentiment: Sentiment;
  /** Frågor (id) som kommentaren tycks beröra. */
  readonly relatedQuestionIds: readonly string[];
  readonly policySignals: readonly PolicySignal[];
  /** Hur kommentarerna påverkade det additiva AI-lagret. Ändrar aldrig matchningssiffran. */
  readonly commentInfluences: readonly CommentInfluence[];
  /** Enskilt flaggade kommentarer; analysfälten bygger enbart på de övriga. */
  readonly commentFlags: readonly CommentFlag[];
  /** true ENDAST när ingen användbar kommentar återstår (alla flaggade). */
  readonly flagged: boolean;
  readonly flagReason: string;
}

/** En kommentar – knuten till en specifik fråga, eller övergripande (utan questionId). */
export interface CommentItem {
  readonly questionId?: string;
  readonly questionText?: string;
  readonly text: string;
}

/** Ett besvarat skalsvar i ord, för grundade AI-tolkningar. */
export interface AnsweredQuestion {
  readonly questionId: string;
  readonly questionText: string;
  /** Hållning på den VISADE formuleringen, eller "vet ej". */
  readonly stance: StanceLabel | "vet ej";
  readonly weight: number;
  /** true när användaren också kommenterade frågan. */
  readonly hasComment: boolean;
}

export interface TopMatch {
  readonly partyId: string;
  readonly partyName: string;
  readonly percent: number | null;
  /** Matchning per dimension, när den skickas med. */
  readonly economicPercent?: number | null;
  readonly galtanPercent?: number | null;
}

export interface AnalyzeInput {
  /** Alla väljarens kommentarer (per-fråga + ev. övergripande) som ska vägas in. */
  readonly comments: readonly CommentItem[];
  /** Väljarens skalsvar i ord (hållning + vikt). Tom lista när inga skickats med. */
  readonly answers: readonly AnsweredQuestion[];
  readonly topMatches: readonly TopMatch[];
  /** Väljarens 2D-position per axel, normerad till [-1, 1]. */
  readonly userCoordinates?: Coordinates;
  readonly questions: readonly { id: string; text: string }[];
}

export interface CommentAnalyzer {
  analyze(input: AnalyzeInput): Promise<CommentAnalysis>;
}

/** Prompt-/schema-version att logga tillsammans med varje analys. */
export const ANALYSIS_SCHEMA_VERSION = "3";

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
    commentInfluences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceQuestionId: { type: "string" },
          affectedQuestionIds: { type: "array", items: { type: "string" } },
          effect: {
            type: "string",
            enum: ["reinforces_answer", "nuances_answer", "adds_priority", "signals_tension", "unclear"],
          },
          note: { type: "string" },
        },
        required: ["affectedQuestionIds", "effect", "note"],
        additionalProperties: false,
      },
    },
    commentFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          commentIndex: {
            type: "integer",
            minimum: 1,
            description: "1-baserat: kommentarens nummer i den numrerade listan.",
          },
          reason: { type: "string" },
        },
        required: ["commentIndex", "reason"],
        additionalProperties: false,
      },
    },
    flagged: { type: "boolean" },
    flagReason: { type: "string" },
  },
  required: ["summary", "themes", "sentiment", "relatedQuestionIds", "policySignals", "commentInfluences", "commentFlags", "flagged", "flagReason"],
  additionalProperties: false,
} as const;
