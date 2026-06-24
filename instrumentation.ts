// Fail-fast: validerar att obligatoriska miljövariabler finns innan appen startar i produktion.
// Next.js anropar register() en gång vid serveruppstart. I dev är detta en no-op så att
// lokal utveckling fungerar utan full produktionskonfiguration.

// Miljövariabler som MÅSTE vara satta i produktion för att tjänsten ska vara säker och fungera.
const REQUIRED_PROD_ENV = [
  "DATABASE_URL", // Postgres — annars hamnar svar i flyktig in-memory-store
  "UPSTASH_REDIS_REST_URL", // delad rate limiting + budget-spärr
  "UPSTASH_REDIS_REST_TOKEN",
  "ADMIN_TOKEN", // skyddar admin-routes
  "CRON_SECRET", // skyddar den schemalagda gallringen
] as const;

export async function register(): Promise<void> {
  const isProd = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  if (!isProd) return; // No-op i utveckling.

  const missing = REQUIRED_PROD_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Saknar obligatoriska miljövariabler i produktion: ${missing.join(", ")}. ` +
        "Sätt dem i hosting-miljön innan deploy.",
    );
  }
}
