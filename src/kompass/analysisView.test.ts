import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTER_THRESHOLD,
  MAX_COMMENT_LENGTH,
  charCounterLabel,
  excludedCommentSummary,
  sentimentLabel,
} from "./analysisView.ts";

test("sentimentLabel mappar alla sentiment till svenska", () => {
  assert.equal(sentimentLabel("positive"), "positiv");
  assert.equal(sentimentLabel("negative"), "negativ");
  assert.equal(sentimentLabel("neutral"), "neutral");
  assert.equal(sentimentLabel("mixed"), "blandad");
});

test("sentimentLabel returnerar null för okända värden", () => {
  assert.equal(sentimentLabel("angry"), null);
  assert.equal(sentimentLabel(""), null);
});

test("charCounterLabel är null under och på tröskeln", () => {
  assert.equal(charCounterLabel(0), null);
  assert.equal(charCounterLabel(COUNTER_THRESHOLD), null);
});

test("charCounterLabel visar svensk tusentalsgruppering över tröskeln", () => {
  assert.equal(charCounterLabel(COUNTER_THRESHOLD + 1), "1 601/2 000");
  assert.equal(charCounterLabel(1823), "1 823/2 000");
  assert.equal(charCounterLabel(MAX_COMMENT_LENGTH), "2 000/2 000");
});

test("charCounterLabel hanterar egna gränser (utan gruppering under tusen)", () => {
  assert.equal(charCounterLabel(90, 100, 80), "90/100");
  assert.equal(charCounterLabel(80, 100, 80), null);
});

const qText = { q1: "Skatten på arbete bör sänkas", q2: "Vinstuttag i välfärden bör begränsas" };

test("excludedCommentSummary är null när inget uteslöts", () => {
  assert.equal(excludedCommentSummary([], qText), null);
});

test("excludedCommentSummary nämner frågetexten, aldrig kommentartexten", () => {
  assert.equal(
    excludedCommentSummary([{ questionId: "q1" }], qText),
    'Kommentaren på frågan "Skatten på arbete bör sänkas" vägdes inte in i tolkningen.',
  );
});

test("excludedCommentSummary beskriver den övergripande kommentaren med versal", () => {
  assert.equal(
    excludedCommentSummary([{ questionId: null }], qText),
    "Den övergripande kommentaren vägdes inte in i tolkningen.",
  );
});

test("excludedCommentSummary binder ihop flera med och", () => {
  assert.equal(
    excludedCommentSummary([{ questionId: "q1" }, { questionId: "q2" }, { questionId: null }], qText),
    'Kommentaren på frågan "Skatten på arbete bör sänkas", kommentaren på frågan "Vinstuttag i välfärden bör begränsas" och den övergripande kommentaren vägdes inte in i tolkningen.',
  );
});

test("excludedCommentSummary faller tillbaka på fråge-id när texten saknas", () => {
  assert.equal(
    excludedCommentSummary([{ questionId: "okand" }], {}),
    'Kommentaren på frågan "okand" vägdes inte in i tolkningen.',
  );
});
