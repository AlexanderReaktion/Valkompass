import { approvePosition, approveQuestion } from "@/src/catalog/catalog.ts";
import { getStores } from "@/src/store/index.ts";
import { requireAdmin } from "@/src/server/admin.ts";

export const runtime = "nodejs";

interface Body {
  kind?: "question" | "position";
  questionId?: string;
  partyId?: string;
  approver?: string;
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
  const now = new Date().toISOString();
  const approver = body.approver || "admin";

  try {
    if (body.kind === "question") {
      const q = (await catalog.listQuestions()).find((x) => x.id === body.questionId);
      if (!q) return Response.json({ error: "Okänd fråga." }, { status: 404 });
      await catalog.saveQuestion(approveQuestion(q, approver, now));
    } else if (body.kind === "position") {
      const p = (await catalog.listPositions()).find(
        (x) => x.questionId === body.questionId && x.partyId === body.partyId,
      );
      if (!p) return Response.json({ error: "Okänd position." }, { status: 404 });
      await catalog.savePosition(approvePosition(p, approver, now));
    } else {
      return Response.json({ error: "kind måste vara 'question' eller 'position'." }, { status: 400 });
    }
  } catch (e) {
    // T.ex. saknad motivering eller belägg → 400 med förklaring.
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  return Response.json({ ok: true });
}
