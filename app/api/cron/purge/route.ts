/**
 * Schemalagd gallring av fritextkommentarer vars retention passerat (efter valdagen).
 * Anropas av Vercel Cron (se vercel.json). Skyddas med CRON_SECRET — Vercel skickar
 * Authorization: Bearer ${CRON_SECRET} automatiskt när variabeln är satt.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { getStores } from "@/src/store/index.ts";

export const runtime = "nodejs";

/** SHA-256-digest av en sträng (fast längd → säker för timingSafeEqual). */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  // Saknad CRON_SECRET nekar alltid.
  if (!secret) {
    return Response.json({ error: "Ej behörig." }, { status: 401 });
  }
  const auth = request.headers.get("authorization") ?? "";
  // Konstant-tidsjämförelse mot "Bearer ${CRON_SECRET}" för att undvika timing-läckor.
  if (!timingSafeEqual(sha256(auth), sha256(`Bearer ${secret}`))) {
    return Response.json({ error: "Ej behörig." }, { status: 401 });
  }

  try {
    const stores = await getStores();
    const removed = await stores.responses.purgeExpired(new Date().toISOString());
    console.log(`[cron/purge] Gallring klar: ${removed} rader borttagna.`);
    return Response.json({ removed });
  } catch (err) {
    console.error("[cron/purge] Gallring misslyckades:", err);
    return Response.json({ error: "Gallring misslyckades." }, { status: 500 });
  }
}
