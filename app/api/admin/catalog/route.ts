import { getStores } from "@/src/store/index.ts";
import { requireAdmin } from "@/src/server/admin.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { catalog } = await getStores();
  const [questions, positions] = await Promise.all([catalog.listQuestions(), catalog.listPositions()]);
  return Response.json({ questions, positions });
}
