// Flat ESLint-config som återanvänder Next.js inbyggda regler (core-web-vitals + typescript).
// eslint-config-next (Next 16) levererar redan färdiga flat-config-arrayer, så vi
// spridder in dem direkt. (FlatCompat undviks: dess legacy-validator kraschar på
// Next-pluginets cirkulära plugin-referenser under ESLint 9.)
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  // Generade/externa kataloger ska aldrig lintas.
  { ignores: ["node_modules/**", ".next/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
