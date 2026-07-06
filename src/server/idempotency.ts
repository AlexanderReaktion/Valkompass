/**
 * Deterministiska id:n för idempotenta omkörningar av /api/analyze.
 *
 * Samma runId ger alltid samma id för samtyckes-, kommentar- och analysrader,
 * så att en re-POST (retry) inte dubblerar rader – stores ignorerar redan
 * förekommande id:n (ON CONFLICT (id) DO NOTHING).
 */

import { createHash } from "node:crypto";

/**
 * sha-256 av "runId:label", formaterad som UUID med versionsfält 4 och
 * variant 10xx så att uuid-kolumner och UUID-regexar accepterar värdet.
 */
export function deriveRunScopedId(runId: string, label: string): string {
  const hex = createHash("sha256").update(`${runId}:${label}`, "utf8").digest("hex");
  const variant = (((parseInt(hex[16]!, 16) & 0x3) | 0x8)).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
