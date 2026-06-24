import { test } from "node:test";
import assert from "node:assert/strict";

import type Anthropic from "@anthropic-ai/sdk";

import { buildStructuredParams, parseStructuredResult } from "./anthropic.ts";

// Bygg ett minimalt men typkorrekt Message-svar för att testa guarden utan nätverk.
function fakeMessage(opts: {
  text?: string;
  stopReason?: Anthropic.Message["stop_reason"];
}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: opts.text === undefined ? [] : [{ type: "text", text: opts.text, citations: null }],
    stop_reason: opts.stopReason ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as unknown as Anthropic.Message;
}

test("buildStructuredParams bygger en typad Messages-payload för structured output", () => {
  const params = buildStructuredParams({
    model: "claude-opus-4-8",
    systemStable: "Systeminstruktion",
    user: "Svara med JSON.",
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    },
    maxTokens: 200,
  });

  assert.equal(params.model, "claude-opus-4-8");
  assert.equal(params.max_tokens, 200);
  assert.deepEqual(params.thinking, { type: "adaptive" });
  assert.equal(params.output_config?.format?.type, "json_schema");
  assert.equal(params.messages[0]?.role, "user");
  assert.equal(params.messages[0]?.content, "Svara med JSON.");
  assert.ok(Array.isArray(params.system));
  assert.equal(params.system[0]?.type, "text");
  assert.deepEqual(params.system[0]?.cache_control, { type: "ephemeral" });
});

test("parseStructuredResult tolkar ett komplett JSON-svar", () => {
  const res = fakeMessage({ text: '{"ok":true}', stopReason: "end_turn" });
  const parsed = parseStructuredResult<{ ok: boolean }>(res);
  assert.deepEqual(parsed, { ok: true });
});

test("parseStructuredResult kastar vid icke-resultat-stop_reason", () => {
  for (const stop of ["max_tokens", "refusal", "pause_turn"] as const) {
    const res = fakeMessage({ text: '{"ok":true}', stopReason: stop });
    assert.throws(
      () => parseStructuredResult(res),
      (err: unknown) => err instanceof Error && err.message.includes(stop),
      `stop_reason ${stop} ska kasta`,
    );
  }
});

test("parseStructuredResult kastar tydligt fel vid trasig/avhuggen JSON", () => {
  // Simulerar ett trunkerat svar som inte är giltig JSON.
  const res = fakeMessage({ text: '{"ok":true', stopReason: "end_turn" });
  assert.throws(
    () => parseStructuredResult(res),
    (err: unknown) => err instanceof Error && /JSON/i.test(err.message),
    "trasig JSON ska kasta ett tydligt fel, inte ett rått SyntaxError",
  );
});

test("parseStructuredResult kastar när textblock saknas", () => {
  const res = fakeMessage({ stopReason: "end_turn" });
  assert.throws(
    () => parseStructuredResult(res),
    (err: unknown) => err instanceof Error && err.message.includes("Inget textsvar"),
  );
});
