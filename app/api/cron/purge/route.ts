/**
 * Schemalagd gallring av fritextkommentarer vars retention passerat (efter valdagen).
 * Anropas av Vercel Cron (se vercel.json). Skyddas med CRON_SECRET — Vercel skickar
 * Authorization: Bearer ${CRON_SECRET} automatiskt när variabeln är satt.
 */

import { getStores } from "@/src/store/index.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Ej behörig." }, { status: 401 });
  }
  const stores = await getStores();
  const removed = await stores.responses.purgeExpired(new Date().toISOString());
  return Response.json({ removed });
}
