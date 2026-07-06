import { test } from "node:test";
import assert from "node:assert/strict";

import { RUN_STATE_VERSION, decodeRunState, encodeRunState } from "./permalink.ts";
import type { RunState } from "./permalink.ts";

const state: RunState = {
  version: RUN_STATE_VERSION,
  mode: "standard",
  seed: "9a2b7c1d-1111-4222-8333-444455556666",
  method: "hybrid",
  answers: {
    skatt_arbete: [2, 1],
    asyl_farre: [-1, 2],
    karnkraft: [null, 1], // vet ej
  },
  boosts: ["Välfärd, bostad & arbete"],
};

test("permalink: encode → decode är en identitet (inkl. åäö och null-svar)", () => {
  const encoded = encodeRunState(state);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/); // URL-säkert fragment
  assert.deepEqual(decodeRunState(encoded), state);
});

test("permalink: trasig payload ger null, inte kast", () => {
  assert.equal(decodeRunState(""), null);
  assert.equal(decodeRunState("!!!inte-base64url???"), null);
  assert.equal(decodeRunState("aGVsbG8"), null); // giltig base64url men inte JSON-objekt
});

test("permalink: fel version, okänt läge eller ogiltiga svar avvisas", () => {
  const bad = (patch: object) =>
    decodeRunState(encodeRunState({ ...state, ...patch } as RunState));
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ mode: "extrem" }), null);
  assert.equal(bad({ method: "magisk" }), null);
  assert.equal(bad({ answers: { q: [99, 1] } }), null); // värde utanför rimlig gräns
  assert.equal(bad({ answers: { q: [1, 0] } }), null); // vikt 0 avvisas
  assert.equal(bad({ answers: { q: [1] } }), null); // trasig tupel
});

test("permalink: utan boosts utelämnas fältet symmetriskt", () => {
  const noBoosts: RunState = {
    version: state.version,
    mode: state.mode,
    seed: state.seed,
    method: state.method,
    answers: state.answers,
  };
  const decoded = decodeRunState(encodeRunState(noBoosts));
  assert.deepEqual(decoded, noBoosts);
  assert.ok(decoded && !("boosts" in decoded));
});
