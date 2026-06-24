/** @type {import('next').NextConfig} */
// React i utvecklingsläge använder eval() för debugverktyg; i produktion aldrig.
// Tillåt därför 'unsafe-eval' enbart i dev, håll produktions-CSP strikt.
const isDev = process.env.NODE_ENV !== "production";

// OBS: 'unsafe-inline' i script-src MÅSTE vara kvar. Next.js injicerar inline
// bootstrap-/hydrerings-script (t.ex. self.__next_f.push(...)) direkt i HTML utan
// nonce när man enbart konfigurerar headers här. Tar man bort 'unsafe-inline' naivt
// slutar sidan att hydrera/rendera. Riktig härdning sker via en nonce-baserad CSP i
// middleware (sätter en per-request nonce och tar bort 'unsafe-inline') — det är nästa
// steg, inte en ändring som kan göras säkert i denna statiska header-config.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Skuggpolicy: samma som ovan men UTAN 'unsafe-inline' i script-src. Rapporteras endast
// (bryter inget) så att vi kan upptäcka vilka inline-script som måste få nonce innan vi
// kan införa den strikta policyn skarpt i middleware.
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
