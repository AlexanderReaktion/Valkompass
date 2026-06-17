import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import { activeCatalog, activeParties, activeScale } from "@/src/data/activeCatalog.ts";
import { rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { MatchMethod } from "@/src/matching/types.ts";
import { getStores } from "@/src/store/index.ts";
import { ConsentMissingError, grantConsent, storeComment } from "@/src/store/service.ts";
import { analyzeComment, isPresentable } from "@/src/analysis/analyze.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";
import { aiConfigured, anthropicCommentAnalyzer } from "@/src/ai/anthropic.ts";
import { allowAiCall, allowRequest } from "@/src/server/limits.ts";

export const runtime = "nodejs";

const BANNER_VERSION = process.env.CONSENT_BANNER_VERSION ?? "v1";
const MAX_COMMENT_LENGTH = 2000;
const MAX_ANSWERS = 200;

interface Body {
  sessionId?: string;
  method?: MatchMethod;
  answers?: Record<string, { value: number | null; weight?: number }>;
  /** Per-fråga-kommentarer + ev. övergripande (questionId utelämnas för övergripande). */
  comments?: { questionId?: string; text?: string }[];
  /** Bakåtkompatibelt: en enskild kommentar. */
  comment?: string;
  questionId?: string;
  consent?: { article9?: boolean; bannerVersion?: string };
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
  if (!sessionId || !body.answers || typeof body.answers !== "object") {
    return Response.json({ error: "sessionId och answers krävs." }, { status: 400 });
  }
  if (Object.keys(body.answers).length > MAX_ANSWERS) {
    return Response.json({ error: "För många svar." }, { status: 400 });
  }
  if (typeof body.comment === "string" && body.comment.length > MAX_COMMENT_LENGTH) {
    return Response.json(
      { error: `Kommentaren är för lång (max ${MAX_COMMENT_LENGTH} tecken).` },
      { status: 400 },
    );
  }

  const method: MatchMethod = body.method ?? "hybrid";
  const questions = toMatchingQuestions(activeCatalog);
  const display: DisplayAnswers = Object.fromEntries(
    Object.entries(body.answers).map(([id, a]) => [id, { value: a.value, weight: a.weight ?? 1 }]),
  );
  const canonical = toCanonicalAnswers(display, questions, activeScale);
  const ranking = rankParties(activeParties, questions, canonical, activeScale, method);
  const userCoords = userCoordinates(questions, canonical, activeScale);

  const stores = await getStores();
  const now = new Date().toISOString();

  await stores.responses.saveResult({
    id: crypto.randomUUID(),
    sessionId,
    catalogVersion: activeCatalog.version,
    method,
    canonicalAnswers: Object.fromEntries(
      Object.entries(canonical).map(([id, a]) => [id, { value: a.value, weight: a.weight ?? 1 }]),
    ),
    ranking,
    createdAt: now,
  });

  // Samla alla kommentarer (per-fråga + ev. övergripande), berika med frågetext.
  const qText: Record<string, string> = Object.fromEntries(activeCatalog.questions.map((q) => [q.id, q.text]));
  const items: { questionId?: string; questionText?: string; text: string }[] = [];
  if (Array.isArray(body.comments)) {
    for (const c of body.comments) {
      if (c && typeof c.text === "string" && c.text.trim()) {
        items.push(c.questionId ? { questionId: c.questionId, questionText: qText[c.questionId], text: c.text } : { text: c.text });
      }
    }
  }
  if (typeof body.comment === "string" && body.comment.trim()) {
    items.push(body.questionId ? { questionId: body.questionId, questionText: qText[body.questionId], text: body.comment } : { text: body.comment });
  }

  let analysis: CommentAnalysis | null = null;
  let analysisNote: string | null = null;

  if (items.length > 0) {
    // Känsliga art. 9-data: kräver uttryckligt samtycke för att analyseras/lagras.
    if (body.consent?.article9 !== true) {
      return Response.json(
        { error: "Uttryckligt samtycke (art. 9) krävs för att analysera och lagra kommentarer." },
        { status: 400 },
      );
    }
    if (items.length > 60 || items.some((c) => c.text.length > MAX_COMMENT_LENGTH)) {
      return Response.json({ error: "För många eller för långa kommentarer." }, { status: 400 });
    }
    await grantConsent(stores.responses, {
      sessionId,
      type: "article9_freetext",
      granted: true,
      bannerVersion: body.consent.bannerVersion ?? BANNER_VERSION,
      now,
      genId: () => crypto.randomUUID(),
    });

    if (!aiConfigured()) {
      analysisNote = "AI-analys ej konfigurerad (ANTHROPIC_API_KEY saknas).";
    } else if (!(await allowAiCall(now))) {
      analysisNote = "Dagens AI-budget är nådd – analysen hoppades över. Försök igen senare.";
    } else {
      try {
        const result = await analyzeComment({
          comments: items,
          ranking,
          questions: activeCatalog.questions.map((q) => ({ id: q.id, text: q.text })),
          analyzer: anthropicCommentAnalyzer(),
        });
        if (isPresentable(result)) analysis = result;
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

  return Response.json({ ranking, userCoords, analysis, analysisNote, aiGenerated: analysis !== null });
}
