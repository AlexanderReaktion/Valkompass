import { test } from "node:test";
import assert from "node:assert/strict";

import {
  matchParty,
  rankParties,
  userCoordinates,
  partyCoordinates,
} from "./engine.ts";
import type { Party, Question, Scale, UserAnswers } from "./types.ts";

const scale: Scale = { min: -2, max: 2 }; // range 4, mitt 0, halv 2

const questions: Question[] = [
  { id: "q1", dimension: "economic" },
  { id: "q2", dimension: "galtan" },
  { id: "q3", dimension: "economic" },
];

const right: Party = { id: "R", name: "Höger", positions: { q1: 2, q2: 2, q3: 2 } };
const left: Party = { id: "L", name: "Vänster", positions: { q1: -2, q2: -2, q3: -2 } };

const ans = (o: Record<string, number | null>): UserAnswers =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

test("perfekt match ger 100 %, motsatt parti 0 % (cityblock)", () => {
  const a = ans({ q1: 2, q2: 2, q3: 2 });
  assert.equal(matchParty(right, questions, a, scale, "cityblock").percent, 100);
  assert.equal(matchParty(left, questions, a, scale, "cityblock").percent, 0);
  assert.equal(matchParty(right, questions, a, scale, "cityblock").answeredCount, 3);
});

test("directional belönar samma sida om mitten", () => {
  const a = ans({ q1: 2, q2: 2, q3: 2 });
  assert.equal(matchParty(right, questions, a, scale, "directional").percent, 100);
  assert.equal(matchParty(left, questions, a, scale, "directional").percent, 0);
});

test("'vet ej' (null) exkluderas parvis och räknas inte", () => {
  const a = ans({ q1: 2, q2: 2, q3: null });
  const m = matchParty(right, questions, a, scale, "cityblock");
  assert.equal(m.answeredCount, 2);
  assert.equal(m.percent, 100);
});

test("obesvarad fråga (saknas helt) exkluderas parvis", () => {
  const a = ans({ q1: 2, q2: 2 }); // q3 saknas
  assert.equal(matchParty(right, questions, a, scale, "cityblock").answeredCount, 2);
});

test("viktning påverkar matchningen", () => {
  const weighted: UserAnswers = { q1: { value: 2, weight: 2 }, q2: { value: -2, weight: 1 } };
  const unweighted: UserAnswers = { q1: { value: 2 }, q2: { value: -2 } };
  const w = matchParty(right, questions, weighted, scale, "cityblock").percent;
  const u = matchParty(right, questions, unweighted, scale, "cityblock").percent;
  assert.equal(u, 50); // (|0| + |4|)/2 = 2 → 1 - 2/4 = 0.5
  assert.equal(w, 66.7); // (2*0 + 1*4)/3 = 1.333 → 1 - 0.333 = 0.667
  assert.ok(w! > u!, "den tyngre, instämmande frågan ska höja matchningen");
});

test("vikt 0 exkluderar frågan", () => {
  const a: UserAnswers = { q1: { value: 2 }, q2: { value: -2, weight: 0 } };
  const m = matchParty(right, questions, a, scale, "cityblock");
  assert.equal(m.answeredCount, 1);
  assert.equal(m.percent, 100);
});

test("hybrid ligger mellan cityblock och directional", () => {
  // Väljare på icke-extremt läge (u=1) mot ett parti på MOTSATT sida (p=-1):
  // riktad likhet straffas extra för centrum-passagen, så dir < cb och hybrid hamnar mellan.
  const a = ans({ q1: 1 });
  const party: Party = { id: "X", name: "X", positions: { q1: -1 } };
  const cb = matchParty(party, questions, a, scale, "cityblock").percent!;
  const dir = matchParty(party, questions, a, scale, "directional").percent!;
  const hy = matchParty(party, questions, a, scale, "hybrid").percent!;
  assert.equal(cb, 50); // 1 - |1-(-1)|/4 = 0.5
  assert.equal(dir, 0); // base 0.5 - straff min(1,1)/2 = 0.5 → 0
  assert.ok(hy > dir && hy < cb, `hybrid (${hy}) ska ligga mellan ${dir} och ${cb}`);
  assert.equal(hy, 25); // (0.5 + 0)/2 = 0.25
});

test("hybrid: en moderat exakt match läser högt (nära 100 %)", () => {
  // Centrist-nära exakt match (u=p=1) ska nu ge ~100 % i hybrid, inte straffas av riktningsmåttet.
  const a = ans({ q1: 1 });
  const exact: Party = { id: "X1", name: "Exakt", positions: { q1: 1 } };
  assert.equal(matchParty(exact, questions, a, scale, "cityblock").percent, 100);
  assert.equal(matchParty(exact, questions, a, scale, "directional").percent, 100);
  assert.equal(matchParty(exact, questions, a, scale, "hybrid").percent, 100);
});

test("directional: självmatch == 100 % för VARJE skalläge (inte bara ytterlägen)", () => {
  for (const v of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
    const a = ans({ q1: v });
    const party: Party = { id: `S${v}`, name: "Själv", positions: { q1: v } };
    const m = matchParty(party, questions, a, scale, "directional").percent;
    assert.equal(m, 100, `självmatch på u=p=${v} ska vara 100 %, fick ${m}`);
  }
});

test("directional: monotont icke-ökande när avståndet växer", () => {
  // Fixerad väljare; partiet flyttas stegvis bort längs samma riktning → likheten får aldrig öka.
  const u = 1;
  const a = ans({ q1: u });
  // Mot extremen på samma sida (+2) och tvärs över mitten (mot -2).
  for (const direction of [1, -1] as const) {
    const extreme = direction > 0 ? 2 : -2;
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const p = u + (extreme - u) * t; // växande |u-p|
      const party: Party = { id: "M", name: "M", positions: { q1: p } };
      const sim = matchParty(party, questions, a, scale, "directional").percent!;
      assert.ok(
        sim <= prev + 1e-9,
        `likheten ökade när avståndet växte (p=${p}, sim=${sim}, prev=${prev})`,
      );
      prev = sim;
    }
  }
});

test("hybrid: vid icke-extremt väljarläge rankas exakt-match-partiet strikt över alla andra", () => {
  // Centrist-nära väljare (u=1) ska kunna särskilja: exakt match slår varje icke-matchande parti.
  const a = ans({ q1: 1, q2: 1, q3: 1 });
  const exact: Party = { id: "E", name: "Exakt", positions: { q1: 1, q2: 1, q3: 1 } };
  const others: Party[] = [
    { id: "O1", name: "Nära", positions: { q1: 1, q2: 1, q3: 0.5 } },
    { id: "O2", name: "Mitten", positions: { q1: 0, q2: 0, q3: 0 } },
    { id: "O3", name: "Motsatt", positions: { q1: -1, q2: -1, q3: -1 } },
    { id: "O4", name: "Extrem", positions: { q1: 2, q2: 2, q3: 2 } },
  ];
  const exactPct = matchParty(exact, questions, a, scale, "hybrid").percent!;
  assert.equal(exactPct, 100, "exakt match ska ge 100 %");
  for (const o of others) {
    const p = matchParty(o, questions, a, scale, "hybrid").percent!;
    assert.ok(exactPct > p, `exakt (${exactPct}) ska ligga strikt över ${o.id} (${p})`);
  }
});

test("euclidean straffar stora enskilda avvikelser hårdare än cityblock", () => {
  const a = ans({ q1: 2, q2: 2 });
  const party: Party = { id: "Y", name: "Y", positions: { q1: 2, q2: -2 } }; // en perfekt, en motsatt
  const cb = matchParty(party, questions, a, scale, "cityblock").percent!;
  const eu = matchParty(party, questions, a, scale, "euclidean").percent!;
  assert.equal(cb, 50);
  assert.ok(eu < cb, `euclidean (${eu}) ska vara lägre än cityblock (${cb})`);
  assert.equal(eu, 29.3); // 1 - sqrt(8)/4
});

test("värden utanför skalan klampas", () => {
  const a = ans({ q1: 5 }); // klampas till 2
  const party: Party = { id: "Z", name: "Z", positions: { q1: 2 } };
  assert.equal(matchParty(party, questions, a, scale, "cityblock").percent, 100);
});

test("inga gemensamt besvarade frågor → percent null", () => {
  const m = matchParty(right, questions, ans({}), scale, "cityblock");
  assert.equal(m.percent, null);
  assert.equal(m.answeredCount, 0);
});

test("ogiltig skala kastar fel", () => {
  assert.throws(() => matchParty(right, questions, ans({ q1: 1 }), { min: 1, max: 1 }));
});

test("rankParties sorterar fallande och beräknar gap", () => {
  const a = ans({ q1: 2, q2: 2, q3: 2 });
  const r = rankParties([left, right], questions, a, scale, "cityblock");
  assert.equal(r.matches[0]!.partyId, "R");
  assert.equal(r.matches[1]!.partyId, "L");
  assert.equal(r.topGap, 100);
  assert.equal(r.isClose, false);
});

test("rankParties flaggar jämna fall (isClose)", () => {
  const a = ans({ q1: 2, q2: 2 });
  const a1: Party = { id: "A", name: "A", positions: { q1: 2, q2: 2 } }; // 100 %
  const a2: Party = { id: "B", name: "B", positions: { q1: 2, q2: 1.9 } }; // ~98.8 %
  const r = rankParties([a1, a2], questions, a, scale, "cityblock");
  assert.equal(r.matches[0]!.partyId, "A");
  assert.ok(r.topGap! <= 3);
  assert.equal(r.isClose, true);
});

test("null-percent rankas sist", () => {
  const a = ans({ q1: 2 });
  const noPos: Party = { id: "N", name: "Ingen position", positions: {} };
  const r = rankParties([noPos, right], questions, a, scale, "cityblock");
  assert.equal(r.matches[0]!.partyId, "R");
  assert.equal(r.matches[1]!.percent, null);
});

test("breakdown redovisar avstånd och per-fråga-överensstämmelse", () => {
  const a = ans({ q1: 2, q2: 0 });
  const m = matchParty(right, questions, a, scale, "cityblock");
  const q2 = m.breakdown.find((b) => b.questionId === "q2")!;
  assert.equal(q2.distance, 2);
  assert.equal(q2.agreement, 0.5); // 1 - 2/4
});

test("userCoordinates beräknar normerade axelkoordinater [-1,1]", () => {
  const a = ans({ q1: 2, q3: 1, q2: -2 });
  const c = userCoordinates(questions, a, scale);
  assert.equal(c.economic, 0.75); // medel av norm(2)=1 och norm(1)=0.5
  assert.equal(c.galtan, -1); // norm(-2)
});

test("partyCoordinates placerar partiet på 2D-kartan", () => {
  const c = partyCoordinates(right, questions, scale);
  assert.equal(c.economic, 1);
  assert.equal(c.galtan, 1);
});

test("axel utan svar ger null-koordinat", () => {
  const a = ans({ q1: 2, q3: 2 }); // bara economic
  const c = userCoordinates(questions, a, scale);
  assert.equal(c.economic, 1);
  assert.equal(c.galtan, undefined); // ingen galtan-fråga besvarad
});
