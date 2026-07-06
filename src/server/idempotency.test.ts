import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveRunScopedId } from "./idempotency.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const runId = "3f2c8a1e-5b7d-4c9e-8f1a-2b3c4d5e6f70";

test("samma runId + etikett ger samma id (deterministiskt)", () => {
  assert.equal(deriveRunScopedId(runId, "consent"), deriveRunScopedId(runId, "consent"));
  assert.equal(deriveRunScopedId(runId, "comment:0"), deriveRunScopedId(runId, "comment:0"));
});

test("olika etikett eller olika runId ger olika id", () => {
  const ids = new Set([
    deriveRunScopedId(runId, "consent"),
    deriveRunScopedId(runId, "analysis"),
    deriveRunScopedId(runId, "comment:0"),
    deriveRunScopedId(runId, "comment:1"),
    deriveRunScopedId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "consent"),
  ]);
  assert.equal(ids.size, 5);
});

test("resultatet är giltigt UUID-format (version 4, variant 10xx)", () => {
  for (const label of ["consent", "analysis", "comment:0", "comment:59"]) {
    const id = deriveRunScopedId(runId, label);
    assert.match(id, UUID_RE, `${label} → ${id}`);
    assert.equal(id[14], "4"); // versionsfält
    assert.ok(["8", "9", "a", "b"].includes(id[19]!), `variant: ${id[19]}`); // variantfält
  }
});
