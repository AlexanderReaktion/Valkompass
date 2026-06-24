import { requireAdmin } from "@/src/server/admin.ts";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  // Publikt svar är en statisk literal som aldrig läser miljövariabler — läcker inget om uppsättningen.
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return Response.json({ status: "ok" });
  }

  // Detaljerad status (för intern övervakning) endast för autentiserad admin.
  return Response.json({
    status: "ok",
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    db: Boolean(process.env.DATABASE_URL),
    rateLimiter:
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? "upstash"
        : "in-memory",
  });
}
