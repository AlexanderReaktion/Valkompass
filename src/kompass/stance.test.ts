import { test } from "node:test";
import assert from "node:assert/strict";

import { stanceLabel } from "./stance.ts";
import type { Scale } from "../matching/types.ts";

const scale: Scale = { min: -2, max: 2 };

test("stanceLabel mappar kanoniska värden till ord på femgradig skala", () => {
  assert.equal(stanceLabel(2, 1, scale), "instämmer helt");
  assert.equal(stanceLabel(1, 1, scale), "instämmer delvis");
  assert.equal(stanceLabel(0, 1, scale), "neutral/splittrad");
  assert.equal(stanceLabel(-1, 1, scale), "tar delvis avstånd");
  assert.equal(stanceLabel(-2, 1, scale), "tar helt avstånd");
});

test("stanceLabel speglar polaritet -1 så orden gäller den VISADE formuleringen", () => {
  // Kanoniskt +2 på en spegelvänd fråga = partiet tar helt avstånd från det visade påståendet.
  assert.equal(stanceLabel(2, -1, scale), "tar helt avstånd");
  assert.equal(stanceLabel(-2, -1, scale), "instämmer helt");
  assert.equal(stanceLabel(-1, -1, scale), "instämmer delvis");
  assert.equal(stanceLabel(0, -1, scale), "neutral/splittrad");
});

test("stanceLabel hanterar icke-heltal och klampar extremvärden", () => {
  assert.equal(stanceLabel(0.4, 1, scale), "neutral/splittrad"); // t=0.2 < 0.25
  assert.equal(stanceLabel(1.6, 1, scale), "instämmer helt"); // t=0.8 ≥ 0.75
  assert.equal(stanceLabel(7, 1, scale), "instämmer helt"); // utanför skalan klampas
});
