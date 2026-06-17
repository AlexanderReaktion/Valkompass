export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    db: Boolean(process.env.DATABASE_URL),
    rateLimiter: process.env.UPSTASH_REDIS_REST_URL ? "upstash" : "in-memory",
  });
}
