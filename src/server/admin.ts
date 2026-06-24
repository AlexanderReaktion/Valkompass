import { createHash, timingSafeEqual } from "node:crypto";

/** SHA-256-digest av en sträng (fast längd → säker för timingSafeEqual). */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Admin-autentisering: kräver matchande x-admin-token mot ADMIN_TOKEN.
 * Jämför med konstant tid (SHA-256-digest + timingSafeEqual) för att undvika
 * timing-läckor. Saknad ADMIN_TOKEN nekar alltid.
 */
export function requireAdmin(request: Request): Response | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return Response.json({ error: "Ej behörig." }, { status: 401 });
  }
  const token = request.headers.get("x-admin-token") ?? "";
  if (!timingSafeEqual(sha256(token), sha256(expected))) {
    return Response.json({ error: "Ej behörig." }, { status: 401 });
  }
  return null;
}
