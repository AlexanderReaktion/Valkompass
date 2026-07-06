/**
 * Kärnlogiken för POST /api/analyze, utbruten ur route-filen så att den kan
 * enhetstestas med in-memory-stores och fake-analyzers (node --test kan inte
 * lösa Next-aliaset @/ i app/-filer).
 *
 * Ordning för durabilitet: samtycke → resultat → ALLA kommentarer → AI-anrop →
 * persistera analysen. Kommentarerna ska överleva även om AI-anropet dör.
 */

import { createHash } from "node:crypto";

import { toMatchingQuestions } from "../catalog/catalog.ts";
import type { ActiveDataset } from "../data/activeCatalog.ts";
import { matchPartyByDimension, rankParties, userCoordinates } from "../matching/engine.ts";
import { toCanonicalAnswers } from "../matching/intake.ts";
import type { DisplayAnswers } from "../matching/intake.ts";
import type { MatchMethod, Scale } from "../matching/types.ts";
import type { ResponseStore } from "../store/types.ts";
import {
  ConsentMissingError,
  grantConsent,
  retentionDeadline,
  storeAnalysis,
  storeComment,
} from "../store/service.ts";
import {
  buildAnalyzeInput,
  buildAnswerSummaries,
  isPresentable,
  sanitizeAnalysis,
} from "../analysis/analyze.ts";
import { buildAnalysisUserMessage } from "../analysis/prompt.ts";
import { ANALYSIS_SCHEMA_VERSION } from "../analysis/types.ts";
import type { CommentAnalysis, CommentAnalyzer } from "../analysis/types.ts";
import { deriveRunScopedId } from "./idempotency.ts";

const MAX_COMMENT_LENGTH = 2000;
const MAX_ANSWERS = 200;
const MAX_COMMENT_ITEMS = 60;
const TOP_N = 3;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS: readonly MatchMethod[] = ["hybrid", "cityblock", "directional", "euclidean"];

interface Body {
  sessionId?: string;
  method?: unknown;
  answers?: Record<string, unknown>;
  /** Per-fråga-kommentarer + ev. övergripande (questionId utelämnas för övergripande). */
  comments?: { questionId?: string; text?: string }[];
  /** Bakåtkompatibelt: en enskild kommentar. */
  comment?: string;
  questionId?: string;
  consent?: { article9?: boolean };
  /** Valfritt idempotens-id (UUID): re-POST med samma runId dubblerar inga rader. */
  runId?: unknown;
}

interface CommentInput {
  questionId?: string;
  questionText?: string;
  text: string;
}

export interface AnalyzeDeps {
  readonly dataset: ActiveDataset;
  readonly responses: ResponseStore;
  /** null när AI inte är konfigurerad. */
  readonly analyzer: CommentAnalyzer | null;
  /** Modell-id som loggas med varje sparad analys. */
  readonly model: string;
  readonly allowAiCall: (nowIso: string) => Promise<boolean>;
  readonly bannerVersion: string;
  readonly now?: () => string;
  readonly genId?: () => string;
}

export interface AnalyzeOutcome {
  readonly status: number;
  readonly body: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseMethod(input: unknown): MatchMethod | null {
  if (input === undefined) return "hybrid";
  return typeof input === "string" && METHODS.includes(input as MatchMethod) ? (input as MatchMethod) : null;
}

function parseAnswers(
  input: unknown,
  questionIds: ReadonlySet<string>,
  scale: Scale,
): { display: DisplayAnswers } | { error: string } {
  if (!isRecord(input)) return { error: "answers måste vara ett objekt." };
  const entries = Object.entries(input);
  if (entries.length > MAX_ANSWERS) return { error: "För många svar." };

  const display: Record<string, { value: number | null; weight: number }> = {};
  for (const [id, raw] of entries) {
    if (!questionIds.has(id)) return { error: `Okänt fråge-id: ${id}.` };
    if (!isRecord(raw)) return { error: `Ogiltigt svar för fråga ${id}.` };
    const value = raw.value;
    const weight = raw.weight ?? 1;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < scale.min || value > scale.max)) {
      return { error: `Ogiltigt svarsvärde för fråga ${id}.` };
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 5) {
      return { error: `Ogiltig vikt för fråga ${id}.` };
    }
    display[id] = { value, weight };
  }
  return { display };
}

function parseComments(
  body: Body,
  questionText: Readonly<Record<string, string>>,
): { items: CommentInput[] } | { error: string } {
  const items: CommentInput[] = [];

  if (Array.isArray(body.comments)) {
    for (const c of body.comments) {
      if (!c || typeof c.text !== "string") continue;
      const text = c.text.trim();
      if (!text) continue;
      if (c.questionId && !(c.questionId in questionText)) return { error: `Okänt kommentars-fråge-id: ${c.questionId}.` };
      if (text.length > MAX_COMMENT_LENGTH) return { error: `Kommentaren är för lång (max ${MAX_COMMENT_LENGTH} tecken).` };
      items.push(c.questionId ? { questionId: c.questionId, questionText: questionText[c.questionId], text } : { text });
    }
  }

  if (typeof body.comment === "string") {
    const text = body.comment.trim();
    if (text.length > MAX_COMMENT_LENGTH) return { error: `Kommentaren är för lång (max ${MAX_COMMENT_LENGTH} tecken).` };
    if (text) {
      if (body.questionId && !(body.questionId in questionText)) return { error: `Okänt kommentars-fråge-id: ${body.questionId}.` };
      items.push(body.questionId ? { questionId: body.questionId, questionText: questionText[body.questionId], text } : { text });
    }
  }

  if (items.length > MAX_COMMENT_ITEMS) return { error: "För många kommentarer." };
  return { items };
}

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/** "Kommentaren på frågan "X" visas inte." – nämner frågan, aldrig kommentartexten. */
function excludedNote(excluded: readonly CommentInput[]): string {
  const parts = excluded.map((c) =>
    c.questionText ? `kommentaren på frågan "${c.questionText}"` : "den övergripande kommentaren",
  );
  const joined =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]!}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} visas inte i analysen.`;
}

export async function runAnalyze(rawBody: unknown, deps: AnalyzeDeps): Promise<AnalyzeOutcome> {
  const err = (status: number, message: string): AnalyzeOutcome => ({ status, body: { error: message } });
  const body: Body = isRecord(rawBody) ? (rawBody as Body) : {};

  const sessionId = body.sessionId;
  if (!sessionId || !UUID_RE.test(sessionId)) return err(400, "Ogiltigt sessionId.");

  const runId = body.runId;
  if (runId !== undefined && (typeof runId !== "string" || !UUID_RE.test(runId))) {
    return err(400, "Ogiltigt runId.");
  }

  const { dataset } = deps;
  const questionIds = new Set(dataset.catalog.questions.map((q) => q.id));
  const qText: Record<string, string> = Object.fromEntries(dataset.catalog.questions.map((q) => [q.id, q.text]));

  if (!body.answers) return err(400, "sessionId och answers krävs.");

  const method = parseMethod(body.method);
  if (!method) return err(400, "Ogiltig matchningsmetod.");

  const parsedAnswers = parseAnswers(body.answers, questionIds, dataset.scale);
  if ("error" in parsedAnswers) return err(400, parsedAnswers.error);

  const parsedComments = parseComments(body, qText);
  if ("error" in parsedComments) return err(400, parsedComments.error);

  const questions = toMatchingQuestions(dataset.catalog);
  const canonical = toCanonicalAnswers(parsedAnswers.display, questions, dataset.scale);
  const ranking = rankParties(dataset.parties, questions, canonical, dataset.scale, method);
  const userCoords = userCoordinates(questions, canonical, dataset.scale);

  const now = (deps.now ?? (() => new Date().toISOString()))();
  const genId = deps.genId ?? ((): string => crypto.randomUUID());
  // Idempotens: med runId härleds alla rad-id:n deterministiskt, utan runId
  // slumpas de som tidigare.
  const resultId = runId ?? genId();
  const consentId = runId ? deriveRunScopedId(runId, "consent") : genId();
  const commentIdAt = (index: number): string => (runId ? deriveRunScopedId(runId, `comment:${index}`) : genId());
  const analysisId = runId ? deriveRunScopedId(runId, "analysis") : genId();

  const items = parsedComments.items;

  let analysis: CommentAnalysis | null = null;
  let analysisNote: string | null = null;
  let excludedComments: { questionId: string | null }[] = [];

  if (items.length > 0) {
    // Känsliga art. 9-data: kräver uttryckligt samtycke för att analyseras/lagras.
    if (body.consent?.article9 !== true) {
      return err(400, "Uttryckligt samtycke (art. 9) krävs för att analysera och lagra kommentarer och svar.");
    }
    await grantConsent(deps.responses, {
      sessionId,
      type: "article9_freetext",
      granted: true,
      // Använd alltid serverns bannerVersion – klientens värde är inte tillförlitligt.
      bannerVersion: deps.bannerVersion,
      now,
      genId: () => consentId,
    });

    // Data-minimering: svarsprofilen lagras under samma uttryckliga art. 9-samtycke
    // som kommentarerna den åtföljer (detta block körs bara när items.length > 0 och
    // samtycke finns ovan). Ändra inte ordningen så att samtyckesspärren kringgås.
    await deps.responses.saveResult({
      id: resultId,
      sessionId,
      catalogVersion: dataset.catalog.version,
      method,
      canonicalAnswers: Object.fromEntries(
        Object.entries(canonical).map(([id, a]) => [id, { value: a.value, weight: a.weight ?? 1 }]),
      ),
      ranking,
      createdAt: now,
      deleteAfter: retentionDeadline(),
    });

    // Lagra ALLA kommentarer FÖRE AI-anropet – de ska vara durabla även om
    // AI-anropet dör (samtycke finns).
    for (const [index, c] of items.entries()) {
      try {
        await storeComment(deps.responses, {
          sessionId,
          text: c.text,
          ...(c.questionId ? { questionId: c.questionId } : {}),
          now,
          genId: () => commentIdAt(index),
        });
      } catch (e) {
        if (!(e instanceof ConsentMissingError)) throw e;
      }
    }

    if (!deps.analyzer) {
      analysisNote = "AI-analysen är inte tillgänglig just nu.";
    } else if (!(await deps.allowAiCall(now))) {
      analysisNote = "Dagens AI-budget är nådd – analysen hoppades över. Försök igen senare.";
    } else {
      // Skicka bara frågorna användaren faktiskt mötte (besvarade + kommenterade) –
      // inte hela banken med variantformuleringar. Annars kan AI:n koppla kommentarer
      // till *_alt-id:n användaren aldrig sett, och prompten sväller i onödan.
      const relevantIds = new Set<string>([
        ...Object.keys(parsedAnswers.display),
        ...items.map((c) => c.questionId).filter((id): id is string => Boolean(id)),
      ]);
      const relevantQuestions = dataset.catalog.questions
        .filter((q) => relevantIds.has(q.id))
        .map((q) => ({ id: q.id, text: q.text }));

      // Skalsvar i ord + per-dimension-matchning för topplistan: grundar
      // AI-tolkningen i vad användaren faktiskt svarade.
      const commentedQuestionIds = new Set(items.map((c) => c.questionId).filter((id): id is string => Boolean(id)));
      const answers = buildAnswerSummaries({
        display: parsedAnswers.display,
        questions: dataset.catalog.questions,
        scale: dataset.scale,
        commentedQuestionIds,
      });
      const partyDimensions = Object.fromEntries(
        ranking.matches.slice(0, TOP_N).flatMap((m) => {
          const party = dataset.parties.find((p) => p.id === m.partyId);
          if (!party) return [];
          const dims = matchPartyByDimension(party, questions, canonical, dataset.scale, method);
          return [
            [
              m.partyId,
              {
                economic: dims.find((d) => d.dimension === "economic")?.percent ?? null,
                galtan: dims.find((d) => d.dimension === "galtan")?.percent ?? null,
              },
            ] as const,
          ];
        }),
      );

      try {
        const input = buildAnalyzeInput({
          comments: items,
          ranking,
          questions: relevantQuestions,
          topN: TOP_N,
          answers,
          userCoordinates: userCoords,
          partyDimensions,
        });
        const raw = await deps.analyzer.analyze(input);
        // Sanera modellens id-referenser mot katalogens fråge-id:n och
        // kommentarantalet innan något returneras eller persisteras.
        const sanitized = sanitizeAnalysis(raw, questionIds, input.comments.length);

        const excludedItems = sanitized.commentFlags.map((f) => items[f.commentIndex - 1]!);
        excludedComments = excludedItems.map((c) => ({ questionId: c.questionId ?? null }));

        if (isPresentable(sanitized)) {
          analysis = sanitized;
          if (excludedItems.length > 0) analysisNote = excludedNote(excludedItems);
        } else {
          // Ingen användbar kommentar återstår – analysen visas inte, men lagras
          // nedan under samtycke och omfattas av retention/gallring (avsiktligt).
          analysisNote = "En eller flera kommentarer flaggades och visas inte.";
        }

        // Persistera analysen (presentabel eller flaggad) med versions- och
        // härledningsmetadata. Ett lagringsfel får inte kasta bort en färdig
        // analys – den är regenererbar och svaret returneras ändå.
        try {
          await storeAnalysis(deps.responses, {
            sessionId,
            schemaVersion: ANALYSIS_SCHEMA_VERSION,
            inputHash: sha256Hex(buildAnalysisUserMessage(input)),
            model: deps.model,
            analysis: sanitized,
            now,
            genId: () => analysisId,
          });
        } catch (e) {
          console.error("[analyze] Kunde inte persistera analysen:", e);
        }
      } catch {
        // AI-felet får inte fälla hela svaret – matchningen returneras ändå
        // och kommentarerna är redan lagrade.
        analysisNote = "AI-analysen kunde inte slutföras just nu.";
      }
    }
  }

  return {
    status: 200,
    body: {
      ranking,
      userCoords,
      analysis,
      analysisNote,
      aiGenerated: analysis !== null,
      excludedComments,
      runId: runId ?? null,
    },
  };
}
