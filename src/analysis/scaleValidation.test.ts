import { test } from "node:test";
import assert from "node:assert/strict";

import {
  covMax,
  covariance,
  cronbachAlpha,
  itemRestCorrelations,
  loevingerH,
  pearson,
  validateScale,
} from "./scaleValidation.ts";

const approx = (a: number | null, b: number, tol = 1e-9) => {
  assert.ok(a !== null, "värdet är null");
  assert.ok(Math.abs(a! - b) < tol, `${a} förväntades vara ~${b}`);
};

test("covariance/pearson/covMax: kända värden", () => {
  const x = [0, 1, 2, 3, 4];
  const y = [0, 2, 4, 6, 8];
  approx(covariance(x, y), 4);
  approx(pearson(x, y), 1);
  approx(covMax(x, y), 4); // redan sammonotona: max = observerad
  const z = [4, 3, 2, 1, 0];
  approx(covariance(x, z), -2);
  approx(covMax(x, z), 2); // sorterade stigande blir de identiska med x-parning
  assert.equal(pearson(x, [1, 1, 1, 1, 1]), null); // konstant variabel saknar korrelation
});

test("cronbachAlpha: två identiska frågor ger 1, sammonotona ger känt värde", () => {
  approx(cronbachAlpha([[1, 1], [2, 2], [3, 3]]), 1);
  // x och 2x: alfa = 2 * (1 - (2 + 8) / 18) = 8/9
  const m = [0, 1, 2, 3, 4].map((v) => [v, 2 * v]);
  approx(cronbachAlpha(m), 8 / 9);
  assert.equal(cronbachAlpha([[1], [2]]), null); // en fråga: odefinierat
});

test("itemRest + Loevingers H: sammonoton skala ger H = 1, felriktad fråga blir negativ", () => {
  const clean = [0, 1, 2, 3, 4].map((v) => [v, 2 * v, v + 1]);
  const rClean = itemRestCorrelations(clean);
  for (const r of rClean) approx(r, 1);
  const hClean = loevingerH(clean);
  approx(hClean.scaleH, 1);
  for (const h of hClean.itemH) approx(h, 1);

  // Tredje frågan speglad: ska flaggas med negativ item-rest och negativt H.
  const flipped = [0, 1, 2, 3, 4].map((v) => [v, 2 * v, -v]);
  const rFlip = itemRestCorrelations(flipped);
  assert.ok(rFlip[2]! < 0, "felriktad fråga ska ha negativ item-rest");
  const hFlip = loevingerH(flipped);
  assert.ok(hFlip.itemH[2]! < 0, "felriktad fråga ska ha negativt H");
});

test("loevingerH hoppar över par med konstant fråga", () => {
  const m = [
    [0, 1, 1],
    [1, 1, 2],
    [2, 1, 3],
  ]; // fråga 2 är konstant
  const { itemH } = loevingerH(m);
  assert.equal(itemH[1], null);
  approx(itemH[0]!, 1);
});

test("validateScale paketerar id, alfa, H och item-diagnostik", () => {
  const report = validateScale("test", ["a", "b"], [[0, 0], [1, 1], [2, 2]]);
  assert.equal(report.itemCount, 2);
  assert.equal(report.caseCount, 3);
  approx(report.alpha, 1);
  approx(report.scaleH, 1);
  assert.deepEqual(report.items.map((i) => i.id), ["a", "b"]);
});

test("parvis exkludering: null-celler (obesvarat/vet ej) förvränger inte kompletta par", () => {
  // Samma sammonotona skala som ovan, men med spridda null (som riktiga svar har).
  const sparse = [
    [0, 0, null],
    [1, 2, 2],
    [2, 4, 3],
    [null, 6, 4],
    [4, 8, null],
  ];
  const { itemH, scaleH } = loevingerH(sparse);
  approx(scaleH, 1);
  for (const h of itemH) approx(h, 1);
  // Rest-medlet byggs på olika delmängder per rad när data saknas, så exakt 1
  // kan inte förväntas när frågorna har olika skala; starkt positivt räcker.
  for (const v of itemRestCorrelations(sparse)) {
    assert.ok(v !== null && v > 0.95, `item-rest ${v} förväntades vara > 0.95`);
  }
  // Färre än två kompletta par ger null i stället för nonsens.
  assert.equal(covariance([1, null, 2], [null, 1, null]), null);
  // Alfa räknas på komplett-fall: identiskt med matrisen av enbart kompletta rader.
  assert.equal(cronbachAlpha(sparse), cronbachAlpha([[1, 2, 2], [2, 4, 3]]));
});
