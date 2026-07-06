import { loadActiveDataset } from "@/src/data/activeCatalog.ts";
import { getStores } from "@/src/store/index.ts";
import { aiConfigured, analysisModelId, anthropicCommentAnalyzer } from "@/src/ai/anthropic.ts";
import { allowAiCall, allowRequest } from "@/src/server/limits.ts";
import { runAnalyze } from "@/src/server/analyzePipeline.ts";

export const runtime = "nodejs";
// Opus-anrop med adaptive thinking kan ta över en minut.
export const maxDuration = 120;

const BANNER_VERSION = process.env.CONSENT_BANNER_VERSION ?? "v1";

/**
 * Härled klient-IP från en plattforms-betrodd källa. x-real-ip sätts av Vercels
 * proxy och kan inte spoofas av klienten. Annars tas SISTA hoppen (längst till
 * höger) i x-forwarded-for – den betrodda gränsen – i stället för den första,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const dataset = await loadActiveDataset();
  const stores = await getStores();

  const outcome = await runAnalyze(body, {
    dataset,
    responses: stores.responses,
    analyzer: aiConfigured() ? anthropicCommentAnalyzer() : null,
    model: analysisModelId(),
    allowAiCall,
    bannerVersion: BANNER_VERSION,
  });

  // no-store: svaret innehåller användarens politiska rankning + AI-analys – cacha aldrig.
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: { "Cache-Control": "no-store" },
  });
}
