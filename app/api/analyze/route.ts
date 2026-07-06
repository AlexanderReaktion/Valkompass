import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import { loadActiveDataset } from "@/src/data/activeCatalog.ts";
import { rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { MatchMethod, Scale } from "@/src/matching/types.ts";
import { getStores } from "@/src/store/index.ts";
import { ConsentMissingError, grantConsent, retentionDeadline, storeComment } from "@/src/store/service.ts";
import { analyzeComment, isPresentable } from "@/src/analysis/analyze.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";
import { aiConfigured, anthropicCommentAnalyzer } from "@/src/ai/anthropic.ts";
import { allowAiCall, allowRequest } from "@/src/server/limits.ts";

export const runtime = "nodejs";

const BANNER_VERSION = process.env.CONSENT_BANNER_VERSION ?? "v1";
const MAX_COMMENT_LENGTH = 2000;
const MAX_ANSWERS = 200;
const MAX_COMMENT_ITEMS = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
}

interface CommentInput {
  questionId?: string;
  questionText?: string;
  text: string;
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

/**
 * Härled klient-IP från en plattforms-betrodd källa. x-real-ip sätts av Vercels
 * proxy och kan inte spoofas av klienten. Annars tas SISTA hoppen (längst till
 * höger) i x-forwarded-for — den betrodda gränsen — i stället för den första,
 * som vem som helst kan förfalska. Saknas IP helt: returnera null så att vi
 * INTE klumpar ihop all sådan trafik i en delad rate-limit-hink.
 */
function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return null;
}

// Tidig storleksspärr: stoppa orimligt stora kroppar innan vi ens läser dem.
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Förfrågan är för stor." }, { status: 413 });
  }

  // Saknas IP: ge en slumpnyckel så att okänd trafik inte delar samma hink.
  const ip = clientIp(request) ?? `anon:${crypto.randomUUID()}`;
  if (!(await allowRequest(ip, Date.now()))) {
    return Response.json({ error: "För många förfrågningar. Försök igen om en stund." }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const sessionId = body.sessionId;
  if (!sessionId || !UUID_RE.test(sessionId)) {
    return Response.json({ error: "Ogiltigt sessionId." }, { status: 400 });
  }

  const dataset = await loadActiveDataset();
  const questionIds = new Set(dataset.catalog.questions.map((q) => q.id));
  const qText: Record<string, string> = Object.fromEntries(dataset.catalog.questions.map((q) => [q.id, q.text]));

  if (!body.answers) {
    return Response.json({ error: "sessionId och answers krävs." }, { status: 400 });
  }

  const method = parseMethod(body.method);
  if (!method) return Response.json({ error: "Ogiltig matchningsmetod." }, { status: 400 });

  const parsedAnswers = parseAnswers(body.answers, questionIds, dataset.scale);
  if ("error" in parsedAnswers) return Response.json({ error: parsedAnswers.error }, { status: 400 });

  const parsedComments = parseComments(body, qText);
  if ("error" in parsedComments) return Response.json({ error: parsedComments.error }, { status: 400 });

  const questions = toMatchingQuestions(dataset.catalog);
  const canonical = toCanonicalAnswers(parsedAnswers.display, questions, dataset.scale);
  const ranking = rankParties(dataset.parties, questions, canonical, dataset.scale, method);
  const userCoords = userCoordinates(questions, canonical, dataset.scale);

  const stores = await getStores();
  const now = new Date().toISOString();

  const items = parsedComments.items;

  let analysis: CommentAnalysis | null = null;
  let analysisNote: string | null = null;

  if (items.length > 0) {
    // Känsliga art. 9-data: kräver uttryckligt samtycke för att analyseras/lagras.
    if (body.consent?.article9 !== true) {
      return Response.json(
        { error: "Uttryckligt samtycke (art. 9) krävs för att analysera och lagra kommentarer och svar." },
        { status: 400 },
      );
    }
    await grantConsent(stores.responses, {
      sessionId,
      type: "article9_freetext",
      granted: true,
      // Använd alltid serverns BANNER_VERSION — klientens värde är inte tillförlitligt.
      bannerVersion: BANNER_VERSION,
      now,
      genId: () => crypto.randomUUID(),
    });

    // Data-minimering: svarsprofilen lagras under samma uttryckliga art. 9-samtycke
    // som kommentarerna den åtföljer (detta block körs bara när items.length > 0 och
    // samtycke finns ovan). Ändra inte ordningen så att samtyckesspärren kringgås.
    await stores.responses.saveResult({
      id: crypto.randomUUID(),
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

    if (!aiConfigured()) {
      analysisNote = "AI-analys ej konfigurerad (ANTHROPIC_API_KEY saknas).";
    } else if (!(await allowAiCall(now))) {
      analysisNote = "Dagens AI-budget är nådd – analysen hoppades över. Försök igen senare.";
    } else {
      // Skicka bara frågorna användaren faktiskt mötte (besvarade + kommenterade) —
      // inte hela banken med variantformuleringar. Annars kan AI:n koppla kommentarer
      // till *_alt-id:n användaren aldrig sett, och prompten sväller i onödan.
      const relevantIds = new Set<string>([
        ...Object.keys(parsedAnswers.display),
        ...items.map((c) => c.questionId).filter((id): id is string => Boolean(id)),
      ]);
      const relevantQuestions = dataset.catalog.questions
        .filter((q) => relevantIds.has(q.id))
        .map((q) => ({ id: q.id, text: q.text }));
      try {
        const result = await analyzeComment({
          comments: items,
          ranking,
          questions: relevantQuestions,
          analyzer: anthropicCommentAnalyzer(),
        });
        if (isPresentable(result)) analysis = result;
        // Flaggad fritext visas INTE för användaren, men lagras ändå nedan under
        // samtycke och omfattas av retention/gallring (avsiktligt — inget undantag).
        else analysisNote = "En eller flera kommentarer flaggades och visas inte.";
      } catch {
        // AI-felet får inte fälla hela svaret — matchningen returneras ändå.
        analysisNote = "AI-analysen kunde inte slutföras just nu.";
      }
    }

    // Lagra varje kommentar (samtycke finns).
    for (const c of items) {
      try {
        await storeComment(stores.responses, {
          sessionId,
          text: c.text,
          ...(c.questionId ? { questionId: c.questionId } : {}),
          now,
          genId: () => crypto.randomUUID(),
        });
      } catch (e) {
        if (!(e instanceof ConsentMissingError)) throw e;
      }
    }
  }

  // no-store: svaret innehåller användarens politiska rankning + AI-analys — cacha aldrig.
  return Response.json(
    { ranking, userCoords, analysis, analysisNote, aiGenerated: analysis !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
