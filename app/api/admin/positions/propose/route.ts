/**
 * Admin-route: föreslå en partiposition via RAG (belägg → modellförslag med citat).
 * Resultatet är ETT UTKAST som en människa godkänner. Bakom admin-token.
 *
 * Demo: korpus skickas in i bodyn. I produktion hämtas det från doc_chunks
 * (pgvector) i stället.
 */

import { activeScale, partyMeta } from "@/src/data/activeCatalog.ts";
import { catalog2026Questions } from "@/src/data/catalog2026.ts";
import { demoCatalog } from "@/src/data/demoCatalog.ts";
import { LexicalRetriever } from "@/src/rag/retriever.ts";
import type { CorpusDoc } from "@/src/rag/retriever.ts";
import { proposeDraftPosition } from "@/src/rag/propose.ts";
import { aiConfigured, anthropicPositionProposer } from "@/src/ai/anthropic.ts";
import { getStores } from "@/src/store/index.ts";
import { requireAdmin } from "@/src/server/admin.ts";
import { allowAdminAiCall } from "@/src/server/limits.ts";

export const runtime = "nodejs";

// Korpus-tak: skydda mot orimligt stora RAG-anrop (kostnad + minne).
const MAX_CORPUS_DOCS = 50;
const MAX_CORPUS_CHARS = 200_000;

interface Body {
  questionId?: string;
  partyId?: string;
  corpus?: CorpusDoc[];
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (!aiConfigured()) {
    return Response.json({ error: "AI ej konfigurerad (ANTHROPIC_API_KEY saknas)." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const { catalog } = await getStores();
  const storedQuestions = await catalog.listQuestions();
  const q =
    storedQuestions.find((x) => x.id === body.questionId) ??
    catalog2026Questions.find((x) => x.id === body.questionId) ??
    demoCatalog.questions.find((x) => x.id === body.questionId);
  const party = partyMeta.find((p) => p.id === body.partyId);
  if (!q || !party) {
    return Response.json({ error: "Okänd fråga eller parti." }, { status: 404 });
  }
  if (!Array.isArray(body.corpus) || body.corpus.length === 0) {
    return Response.json(
      { error: "corpus krävs: en lista av {id, partyId, text, source:{label,url?}}." },
      { status: 400 },
    );
  }

  // Tak för korpus innan retrievern byggs: antal dokument och total textmängd.
  if (body.corpus.length > MAX_CORPUS_DOCS) {
    return Response.json({ error: `För många dokument i corpus (max ${MAX_CORPUS_DOCS}).` }, { status: 400 });
  }
  const totalChars = body.corpus.reduce((sum, d) => sum + (typeof d?.text === "string" ? d.text.length : 0), 0);
  if (totalChars > MAX_CORPUS_CHARS) {
    return Response.json({ error: `Korpus är för stort (max ${MAX_CORPUS_CHARS} tecken).` }, { status: 400 });
  }

  // Separat daglig budget för admin-AI-anrop.
  if (!(await allowAdminAiCall(new Date().toISOString()))) {
    return Response.json(
      { error: "Dagens budget för admin-AI-anrop är nådd. Försök igen senare." },
      { status: 429 },
    );
  }

  const retriever = new LexicalRetriever(body.corpus);
  let position, proposal;
  try {
    ({ position, proposal } = await proposeDraftPosition({
      questionId: q.id,
      questionText: q.text,
      partyId: party.id,
      partyName: party.name,
      scale: activeScale,
      retriever,
      proposer: anthropicPositionProposer(),
    }));
  } catch (e) {
    // Avgör om felet är ett tillfälligt tillgänglighetsfel (rate limit / timeout / 5xx)
    // eller ett modell-/parse-fel. Returnera tydligt svenskt fel i stället för 500.
    const msg = e instanceof Error ? e.message : String(e);
    const transient = /\b(429|5\d\d|rate.?limit|timeout|timed out|överbelast|overload|unavailable|ECONNRESET|ETIMEDOUT)\b/i.test(msg);
    if (transient) {
      return Response.json(
        { error: "AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund." },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Kunde inte tolka modellens svar för förslaget." },
      { status: 502 },
    );
  }

  return Response.json({ draft: position, proposal });
}
