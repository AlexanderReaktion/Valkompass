import { publishCatalog, validateForPublish } from "@/src/catalog/catalog.ts";
import { activeScale, partyMeta } from "@/src/data/activeCatalog.ts";
import { getStores } from "@/src/store/index.ts";
import { requireAdmin } from "@/src/server/admin.ts";

export const runtime = "nodejs";

interface Body {
  version?: number;
  election?: string;
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const { catalog } = await getStores();
  const [allQuestions, positions] = await Promise.all([catalog.listQuestions(), catalog.listPositions()]);
  const questions = allQuestions.filter((q) => q.status === "approved");
  const parties = partyMeta.map((p) => ({ id: p.id, name: p.name }));

  const validation = validateForPublish({ questions, parties, positions, scale: activeScale, minQuestions: 1 });
  if (!validation.ok) {
    return Response.json({ ok: false, validation });
  }

  const published = publishCatalog(
    {
      questions,
      parties,
      positions,
      scale: activeScale,
      version: body.version ?? 1,
      election: body.election ?? "riksdagsval-2026",
      minQuestions: 1,
    },
    new Date().toISOString(),
  );
  await catalog.savePublished(published);

  return Response.json({ ok: true, validation, version: published.version, election: published.election });
}
