/**
 * Admin-route: föreslå en partiposition via RAG (belägg → modellförslag med citat).
 * Resultatet är ETT UTKAST som en människa godkänner. Bakom admin-token.
 *
 * Demo: korpus skickas in i bodyn. I produktion hämtas det från doc_chunks
 * (pgvector) i stället.
 */

import { demoCatalog, demoPartyMeta, demoScale } from "@/src/data/demoCatalog.ts";
import { LexicalRetriever } from "@/src/rag/retriever.ts";
import type { CorpusDoc } from "@/src/rag/retriever.ts";
import { proposeDraftPosition } from "@/src/rag/propose.ts";
import { aiConfigured, anthropicPositionProposer } from "@/src/ai/anthropic.ts";

export const runtime = "nodejs";

interface Body {
  questionId?: string;
  partyId?: string;
  corpus?: CorpusDoc[];
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return Response.json({ error: "Ej behörig." }, { status: 403 });
  }
  if (!aiConfigured()) {
    return Response.json({ error: "AI ej konfigurerad (ANTHROPIC_API_KEY saknas)." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const q = demoCatalog.questions.find((x) => x.id === body.questionId);
  const party = demoPartyMeta.find((p) => p.id === body.partyId);
  if (!q || !party) {
    return Response.json({ error: "Okänd fråga eller parti." }, { status: 404 });
  }
  if (!Array.isArray(body.corpus) || body.corpus.length === 0) {
    return Response.json(
      { error: "corpus krävs: en lista av {id, partyId, text, source:{label,url?}}." },
      { status: 400 },
    );
  }

  const retriever = new LexicalRetriever(body.corpus);
  const { position, proposal } = await proposeDraftPosition({
    questionId: q.id,
    questionText: q.text,
    partyId: party.id,
    partyName: party.name,
    scale: demoScale,
    retriever,
    proposer: anthropicPositionProposer(),
  });

  return Response.json({ draft: position, proposal });
}
