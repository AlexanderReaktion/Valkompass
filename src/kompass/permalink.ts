/**
 * Permalink-kodek: kodar en körnings tillstånd (läge, seed, metod, svar,
 * ämnesviktning) till ett kompakt base64url-fragment och tillbaka.
 *
 * Designval:
 *  - Läggs i URL-FRAGMENTET (#r=...): fragmentet skickas aldrig till servern,
 *    så politiska svar hamnar inte i serverloggar (dataminimering).
 *  - Deterministisk motor + seed ⇒ länken återskapar exakt samma körning.
 *  - decode är defensiv: trasig/okänd payload ger null, aldrig ett kast.
 */

import type { MatchMethod } from "../matching/types.ts";
import type { TestModeId } from "./testPlan.ts";

export const RUN_STATE_VERSION = 1 as const;

export interface RunState {
  readonly version: typeof RUN_STATE_VERSION;
  readonly mode: TestModeId;
  readonly seed: string;
  readonly method: MatchMethod;
  /** Visningssvar per fråge-id: [värde eller null (= vet ej), vikt]. */
  readonly answers: Readonly<Record<string, readonly [number | null, number]>>;
  /** Uppviktade sektionstitlar (användarens ämnesviktning). */
  readonly boosts?: readonly string[];
}

const MODES: readonly TestModeId[] = ["quick", "standard", "deep"];
const METHODS: readonly MatchMethod[] = ["hybrid", "cityblock", "directional", "euclidean"];

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

export function encodeRunState(state: RunState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validAnswerTuple(v: unknown): v is readonly [number | null, number] {
  if (!Array.isArray(v) || v.length !== 2) return false;
  const [value, weight] = v as [unknown, unknown];
  const valueOk = value === null || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10);
  const weightOk = typeof weight === "number" && Number.isFinite(weight) && weight > 0 && weight <= 5;
  return valueOk && weightOk;
}

/** Avkoda ett fragment till RunState. Returnerar null för allt som inte validerar. */
export function decodeRunState(encoded: string): RunState | null {
  if (!encoded || encoded.length > 20_000) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== RUN_STATE_VERSION) return null;
  if (!MODES.includes(parsed.mode as TestModeId)) return null;
  if (!METHODS.includes(parsed.method as MatchMethod)) return null;
  if (typeof parsed.seed !== "string" || parsed.seed.length === 0 || parsed.seed.length > 128) return null;
  if (!isRecord(parsed.answers)) return null;
  const answers: Record<string, readonly [number | null, number]> = {};
  const entries = Object.entries(parsed.answers);
  if (entries.length > 500) return null;
  for (const [id, tuple] of entries) {
    if (!validAnswerTuple(tuple)) return null;
    answers[id] = [tuple[0], tuple[1]];
  }
  let boosts: readonly string[] | undefined;
  if (parsed.boosts !== undefined) {
    if (!Array.isArray(parsed.boosts) || parsed.boosts.length > 20) return null;
    if (!parsed.boosts.every((b) => typeof b === "string" && b.length <= 100)) return null;
    boosts = parsed.boosts as string[];
  }
  return {
    version: RUN_STATE_VERSION,
    mode: parsed.mode as TestModeId,
    seed: parsed.seed,
    method: parsed.method as MatchMethod,
    answers,
    ...(boosts ? { boosts } : {}),
  };
}
