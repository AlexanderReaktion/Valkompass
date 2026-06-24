import { getStores } from "@/src/store/index.ts";
import { allowRequest } from "@/src/server/limits.ts";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Body {
  sessionId?: string;
}

/**
 * GDPR art. 15/20 – tillgång och dataportabilitet via session-referensen.
 * Returnerar all sparad data (resultat, kommentarer, samtycke) för sessionen.
 */
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
  if (!sessionId || !UUID_RE.test(sessionId)) {
    return Response.json({ error: "Ogiltigt sessionId." }, { status: 400 });
  }

  const data = await (await getStores()).responses.exportBySession(sessionId);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
