/**
 * Anthropic-backade implementationer av PositionProposer och CommentAnalyzer.
 *
 * - Modell-id per steg via env (default claude-opus-4-8).
 * - Adaptive thinking + Structured Outputs (output_config.format).
 * - Prompt caching på det stabila system-blocket.
 * - Server-side only. Konstruerar klienten lazy så bygget inte kräver nyckel.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { SourceRef } from "../catalog/types.ts";
import type { PositionProposer, ProposePositionInput, ProposedPosition } from "./types.ts";
import type { AnalyzeInput, CommentAnalysis, CommentAnalyzer } from "../analysis/types.ts";
import { ANALYSIS_SCHEMA_VERSION, COMMENT_ANALYSIS_SCHEMA } from "../analysis/types.ts";

const MODEL_ANALYSIS = process.env.MODEL_ANALYSIS ?? "claude-opus-4-8";
const MODEL_POSITIONS = process.env.MODEL_POSITIONS ?? "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY saknas – AI-anrop kan inte göras.");
  if (!client) client = new Anthropic();
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

interface StructuredCall {
  readonly model: string;
  readonly systemStable: string; // cachas
  readonly user: string;
  readonly schema: unknown;
  readonly maxTokens: number;
}

async function structured<T>(call: StructuredCall): Promise<T> {
  const params = {
    model: call.model,
    max_tokens: call.maxTokens,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: call.systemStable, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: call.schema } },
    messages: [{ role: "user", content: call.user }],
  };
  const res = await getClient().messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming,
  );
  const blocks = (res as { content: Array<{ type: string; text?: string }> }).content;
  const text = blocks.find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (!text) throw new Error("Inget textsvar från modellen.");
  return JSON.parse(text) as T;
}

// ---------- positionsförslag (RAG) ----------

const POSITION_SYSTEM = `Du hjälper en oberoende valkompass att föreslå var ett parti står i en sakfråga, på en skala.
Regler:
- Grunda förslaget ENBART på de medskickade källutdragen. Hitta inte på ståndpunkter.
- Skalan: lägre = mer vänster / mer GAL; högre = mer höger / mer TAN. Mitten = neutral/splittrad.
- Ange citat (label + url) för de utdrag du faktiskt stödjer dig på.
- Sätt låg confidence om underlaget är tunt eller motsägelsefullt.
- Detta är ett UTKAST som en människa granskar och godkänner. Föreslå inte att man röstar på något parti.`;

const POSITION_SCHEMA = {
  type: "object",
  properties: {
    value: { type: "number" },
    confidence: { type: "number" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, url: { type: "string" } },
        required: ["label", "url"],
        additionalProperties: false,
      },
    },
    reasoning: { type: "string" },
  },
  required: ["value", "confidence", "citations", "reasoning"],
  additionalProperties: false,
} as const;

interface RawProposal {
  value: number;
  confidence: number;
  citations: { label: string; url: string }[];
  reasoning: string;
}

export function anthropicPositionProposer(): PositionProposer {
  return {
    async propose(input: ProposePositionInput): Promise<ProposedPosition> {
      const context = input.context
        .map((c, i) => `[${i + 1}] (${c.doc.source.label}${c.doc.source.url ? ` ${c.doc.source.url}` : ""})\n${c.doc.text}`)
        .join("\n\n");
      const user = `Fråga: "${input.questionText}"
Parti: ${input.partyName} (${input.partyId})
Skala: ${input.scale.min} till ${input.scale.max}

Källutdrag:
${context || "(inga utdrag hittades)"}`;

      const raw = await structured<RawProposal>({
        model: MODEL_POSITIONS,
        systemStable: POSITION_SYSTEM,
        user,
        schema: POSITION_SCHEMA,
        maxTokens: 1500,
      });

      const citations: SourceRef[] = raw.citations.map((c) =>
        c.url ? { label: c.label, url: c.url } : { label: c.label },
      );
      return { value: raw.value, confidence: raw.confidence, citations, reasoning: raw.reasoning };
    },
  };
}

// ---------- kommentaranalys ----------

const ANALYSIS_SYSTEM = `Du analyserar en väljares fritextkommentarer i en valkompass. Några hör till specifika frågor, någon kan vara övergripande. Gör EN samlad, neutral och tolkande analys som väger in ALLA kommentarerna.
Regler:
- Sammanfatta och tematisera vad personen faktiskt uttrycker över alla kommentarer. Lägg inte ord i mun.
- Koppla till relevanta frågor (relatedQuestionIds) bara när det är tydligt – inkludera de frågor kommentarerna gäller.
- policySignals: notera ev. lutning (left/right/gal/tan) per dimension, eller "unclear".
- Rekommendera ALDRIG ett parti. Detta lager ändrar inte matchningssiffran.
- Sätt flagged=true endast vid olämpligt/skadligt innehåll (hat, hot, spam) och ange flagReason; annars flagged=false och flagReason="".
- Svara på svenska.`;

export function anthropicCommentAnalyzer(): CommentAnalyzer {
  return {
    async analyze(input: AnalyzeInput): Promise<CommentAnalysis> {
      const top = input.topMatches
        .map((m) => `${m.partyName}: ${m.percent === null ? "–" : `${m.percent}%`}`)
        .join(", ");
      const qlist = input.questions.map((q) => `${q.id}: ${q.text}`).join("\n");
      const commentsText = input.comments
        .map((c, i) => `${i + 1}. ${c.questionId ? `[fråga: ${c.questionText ?? c.questionId}]` : "[övergripande]"}\n"${c.text}"`)
        .join("\n\n");
      const user = `Väljarens kommentarer:
${commentsText}

Användarens toppmatchningar: ${top || "(inga)"}

Frågor (id: text):
${qlist || "(inga)"}`;

      return structured<CommentAnalysis>({
        model: MODEL_ANALYSIS,
        systemStable: `${ANALYSIS_SYSTEM}\n(schema v${ANALYSIS_SCHEMA_VERSION})`,
        user,
        schema: COMMENT_ANALYSIS_SCHEMA,
        maxTokens: 2000,
      });
    },
  };
}
