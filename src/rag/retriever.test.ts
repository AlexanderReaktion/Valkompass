import { test } from "node:test";
import assert from "node:assert/strict";

import { LexicalRetriever, tokenize } from "./retriever.ts";
import type { CorpusDoc } from "./retriever.ts";

const docs: CorpusDoc[] = [
  { id: "d1", partyId: "M", text: "Vi vill sänka skatten på arbete och stärka jobben.", source: { label: "M-program s.4" } },
  { id: "d2", partyId: "V", text: "Höjda skatter på höga inkomster ska finansiera välfärden.", source: { label: "V-program s.2" } },
  { id: "d3", partyId: "MP", text: "Klimatet kräver utbyggd kollektivtrafik och minskade utsläpp.", source: { label: "MP-program s.7" } },
];

test("tokenize hanterar svenska tecken och gemener", () => {
  assert.deepEqual(tokenize("Höjda skatter, JOBB!"), ["höjda", "skatter", "jobb"]);
});

test("retrieve rankar mest relevanta dokument först", async () => {
  const r = new LexicalRetriever(docs);
  const hits = await r.retrieve("skatt på arbete", 3);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0]!.doc.id, "d1");
});

test("retrieve filtrerar på parti", async () => {
  const r = new LexicalRetriever(docs);
  const hits = await r.retrieve("skatter välfärd", 5, "V");
  assert.ok(hits.every((h) => h.doc.partyId === "V"));
  assert.equal(hits[0]!.doc.id, "d2");
});

test("tom eller icke-matchande fråga ger inga träffar", async () => {
  const r = new LexicalRetriever(docs);
  assert.deepEqual(await r.retrieve("", 3), []);
  assert.deepEqual(await r.retrieve("rymdfärja teleportering", 3), []);
});
