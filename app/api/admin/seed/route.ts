/**
 * Seedar store med utkast (draft) så granskaren har något att godkänna i admin-UI:t.
 *   ?set=2026  → den AI-researchade 2026-katalogen (riktiga frågor + positioner med källor)
 *   (default)  → enkel demo-katalog
 */

import { catalog2026Positions, catalog2026Questions } from "@/src/data/catalog2026.ts";
import { demoCatalog, demoPositions } from "@/src/data/demoCatalog.ts";
import { getStores } from "@/src/store/index.ts";
import { requireAdmin } from "@/src/server/admin.ts";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const set = new URL(request.url).searchParams.get("set");
  const questions = set === "2026" ? catalog2026Questions : demoCatalog.questions;
  const positions = set === "2026" ? catalog2026Positions : demoPositions;

  const { catalog } = await getStores();

  for (const q of questions) {
    const { approvedBy: _a, approvedAt: _b, ...rest } = q;
    await catalog.saveQuestion({ ...rest, status: "draft" });
  }
  for (const p of positions) {
    const { approvedBy: _a, approvedAt: _b, ...rest } = p;
    await catalog.savePosition({ ...rest, status: "draft" });
  }

  return Response.json({ ok: true, set: set ?? "demo", questions: questions.length, positions: positions.length });
}
