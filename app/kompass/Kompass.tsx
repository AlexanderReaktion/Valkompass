"use client";

import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import type { PublishedCatalog } from "@/src/catalog/types.ts";
import { partyCoordinates, rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { Coordinates, MatchMethod, Party, Scale } from "@/src/matching/types.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";
import { TEST_MODES, buildTestPlan } from "@/src/kompass/testPlan.ts";
import type { TestModeId } from "@/src/kompass/testPlan.ts";

interface Props {
  catalog: PublishedCatalog;
  parties: Party[];
  scale: Scale;
  sources: Record<string, { label: string; url: string }>;
  isPublished: boolean;
}

interface AnswerState {
  value: number | null; // display-space; null = vet ej
  weight: number;
}

interface RunSnapshot {
  id: string;
  mode: TestModeId;
  seed: string;
  topPartyId: string | null;
  topPartyName: string | null;
  topPercent: number | null;
  topThree: string[];
  coords: Coordinates;
  answeredCount: number;
}

const SCALE_OPTS = [
  { v: -2, label: "Tar helt avstånd" },
  { v: -1, label: "Tar delvis avstånd" },
  { v: 0, label: "Neutral" },
  { v: 1, label: "Instämmer delvis" },
  { v: 2, label: "Instämmer helt" },
];

const METHODS: { v: MatchMethod; label: string }[] = [
  { v: "hybrid", label: "Hybrid (rekommenderad)" },
  { v: "cityblock", label: "City-block" },
  { v: "directional", label: "Riktning" },
  { v: "euclidean", label: "Euclidean" },
];

const PARTY_COLORS: Record<string, string> = {
  V: "#b00000", S: "#e8112d", MP: "#5bb030", C: "#1c9a4b", L: "#3aa3e0", KD: "#23356e", M: "#1d7fc4", SD: "#dab600",
};
const LEANING: Record<string, string> = { left: "vänster", right: "höger", gal: "frihetlig (GAL)", tan: "auktoritär (TAN)", unclear: "oklar" };
const DIMLABEL: Record<string, string> = { economic: "Ekonomi", galtan: "Värderingar", none: "Övrigt" };
const INFLUENCE: Record<string, string> = {
  reinforces_answer: "Förstärkte",
  nuances_answer: "Nyanserade",
  adds_priority: "Prioriterade",
  signals_tension: "Visade spänning",
  unclear: "Oklar effekt",
};

function agree(a: number): { t: string; c: string } {
  return a >= 0.8 ? { t: "Överens", c: "ag-high" } : a >= 0.5 ? { t: "Delvis", c: "ag-mid" } : { t: "Oense", c: "ag-low" };
}
function lean(v: number | null | undefined, pos: string, neg: string): string | null {
  if (v == null) return null;
  return v > 0.2 ? pos : v < -0.2 ? neg : "i mitten";
}

// ---------- kompakt skala ----------
// Hoistad till modulnivå så React inte återskapar (och därmed avmonterar/återställer
// fokus på) komponenten vid varje omladdning. Beroenden skickas in som props.
function Scale({
  id,
  answer,
  questionText,
  onSetValue,
  onToggleWeight,
}: {
  id: string;
  answer: AnswerState | undefined;
  questionText: string;
  onSetValue: (id: string, value: number | null) => void;
  onToggleWeight: (id: string) => void;
}) {
  const a = answer;
  const selected = a && a.value !== null ? a.value : null;
  const vetej = a !== undefined && a.value === null;
  const caption = vetej ? "Vet ej" : selected !== null ? SCALE_OPTS.find((o) => o.v === selected)?.label : "Inte besvarad";
  const focusValue = selected ?? 0;
  const move = (delta: number) => {
    const index = Math.max(0, SCALE_OPTS.findIndex((o) => o.v === focusValue));
    const next = SCALE_OPTS[Math.min(SCALE_OPTS.length - 1, Math.max(0, index + delta))]!;
    onSetValue(id, next.v);
  };
  const onScaleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      onSetValue(id, SCALE_OPTS[0]!.v);
    } else if (e.key === "End") {
      e.preventDefault();
      onSetValue(id, SCALE_OPTS[SCALE_OPTS.length - 1]!.v);
    }
  };
  return (
    <div className="scale2">
      <div className="segrow" role="radiogroup" aria-label={`Svarsskala för: ${questionText}`}>
        <span className="endlabel">Tar avstånd</span>
        {SCALE_OPTS.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={selected === o.v}
            aria-label={o.label}
            title={o.label}
            tabIndex={focusValue === o.v ? 0 : -1}
            className={`seg${selected === o.v ? " on" : ""}`}
            onClick={() => onSetValue(id, o.v)}
            onKeyDown={onScaleKey}
          />
        ))}
        <span className="endlabel">Instämmer</span>
      </div>
      {/* Små markörer under varje segment så att de fem stegen syns innan man klickar.
          Osynliga ändetiketter speglar segrow-bredden så markörerna hamnar under rätt segment. */}
      <div className="segmarks" aria-hidden="true">
        <span className="endlabel segmark-spacer">Tar avstånd</span>
        {SCALE_OPTS.map((o) => (
          <span className="segmark" key={o.v}>{o.label}</span>
        ))}
        <span className="endlabel segmark-spacer">Instämmer</span>
      </div>
      <div className="scalefoot">
        <span className={`caption${selected !== null ? " set" : ""}`}>{caption}</span>
        <span className="footactions">
          <button type="button" className={`linkbtn${vetej ? " on" : ""}`} aria-pressed={vetej} onClick={() => onSetValue(id, null)}>Vet ej</button>
          <button type="button" className={`star${(a?.weight ?? 1) === 2 ? " on" : ""}`} aria-pressed={(a?.weight ?? 1) === 2} onClick={() => onToggleWeight(id)} title="Markera som extra viktig">
            ★ Viktig
          </button>
        </span>
      </div>
    </div>
  );
}

function ProgressHeader({
  headingRef,
  title,
  answeredCount,
  total,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  answeredCount: number;
  total: number;
}) {
  return (
    <div className="progress">
      <div className="progresshead">
        {/* Kontextuell h1: byts mellan frågestegen och resultatet; tar emot fokus vid stegbyte. */}
        <h1 ref={headingRef} tabIndex={-1} className="progresstitle">{title}</h1>
        <span className="meta">{answeredCount}/{total} besvarade</span>
      </div>
      {/* Visuell stapel döljs för skärmläsare – siffran ovan säger redan samma sak. */}
      <div className="progresstrack" aria-hidden="true"><div className="progressfill" style={{ width: `${(answeredCount / total) * 100}%` }} /></div>
    </div>
  );
}

export default function Kompass({ catalog, parties, scale, sources, isPublished }: Props) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0); // 0..sections.length-1 = section; ===length = resultat
  const [mode, setMode] = useState<TestModeId>("standard");
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [runSeed, setRunSeed] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [method, setMethod] = useState<MatchMethod>("hybrid");
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Beständig sessionsreferens: stabil över omladdningar så användaren kan begära radering.
  const [sessionId] = useState(() => {
    try {
      const saved = localStorage.getItem("kompass-session");
      if (saved) return saved;
      const fresh = crypto.randomUUID();
      localStorage.setItem("kompass-session", fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  });
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({}); // per-fråga
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [shared, setShared] = useState<"clipboard" | "shared" | false>(false);
  const [ai, setAi] = useState<{ loading: boolean; analysis: CommentAnalysis | null; note: string | null; error: string | null }>({
    loading: false, analysis: null, note: null, error: null,
  });
  const [history, setHistory] = useState<RunSnapshot[]>([]);

  // Fokushantering: flytta fokus till rubriken vid stegbyte (a11y).
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, started]);

  const plan = useMemo(() => buildTestPlan(catalog.questions, runSeed, mode), [catalog.questions, runSeed, mode]);
  const sections = plan.sections;
  const selectedCatalog = useMemo(
    () => ({ ...catalog, questions: plan.selectedQuestions }),
    [catalog, plan.selectedQuestions],
  );
  const questions = useMemo(() => toMatchingQuestions(selectedCatalog), [selectedCatalog]);
  const qText = useMemo(() => Object.fromEntries(catalog.questions.map((q) => [q.id, q.text])), [catalog]);
  const total = plan.selectedQuestions.length;

  const setVal = (id: string, value: number | null) =>
    setAnswers((s) => ({ ...s, [id]: { value, weight: s[id]?.weight ?? 1 } }));
  const toggleWeight = (id: string) =>
    setAnswers((s) => ({ ...s, [id]: { value: s[id]?.value ?? null, weight: (s[id]?.weight ?? 1) === 2 ? 1 : 2 } }));

  const answeredCount = plan.selectedQuestions.filter((q) => answers[q.id]?.value !== null && answers[q.id]?.value !== undefined).length;

  const result = useMemo(() => {
    const display: DisplayAnswers = Object.fromEntries(
      Object.entries(answers).map(([id, a]) => [id, { value: a.value, weight: a.weight }]),
    );
    const canonical = toCanonicalAnswers(display, questions, scale);
    return {
      ranked: rankParties(parties, questions, canonical, scale, method),
      userCoords: userCoordinates(questions, canonical, scale),
    };
  }, [answers, questions, parties, scale, method]);

  const partyPoints = useMemo(
    () => parties.map((p) => ({ id: p.id, name: p.name, coords: partyCoordinates(p, questions, scale) })),
    [parties, questions, scale],
  );

  const commentItems = () => {
    const items: { questionId?: string; text: string }[] = [];
    for (const [id, text] of Object.entries(comments)) if (text.trim()) items.push({ questionId: id, text });
    if (comment.trim()) items.push({ text: comment });
    return items;
  };

  async function submitComment() {
    const items = commentItems();
    if (items.length === 0 || !consent) return;
    setAi({ loading: true, analysis: null, note: null, error: null });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId, method,
          answers: Object.fromEntries(plan.selectedQuestions
            .filter((q) => answers[q.id])
            .map((q) => [q.id, { value: answers[q.id]!.value, weight: answers[q.id]!.weight }])),
          comments: items, consent: { article9: true },
        }),
      });
      const data = (await res.json()) as { error?: string; analysis?: CommentAnalysis | null; analysisNote?: string | null };
      if (!res.ok) { setAi({ loading: false, analysis: null, note: null, error: data.error ?? "Något gick fel." }); return; }
      setAi({ loading: false, analysis: data.analysis ?? null, note: data.analysisNote ?? null, error: null });
    } catch {
      setAi({ loading: false, analysis: null, note: null, error: "Nätverksfel." });
    }
  }

  async function share() {
    const top = result.ranked.matches.slice(0, 3).map((m, i) => `${i + 1}. ${m.partyName} ${m.percent ?? "–"}%`).join(" · ");
    const text = `Min valkompass 2026: ${top}`;
    const url = typeof window !== "undefined" ? `${window.location.origin}/kompass` : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Valkompass 2026", text, url });
        setShared("shared");
        setTimeout(() => setShared(false), 4000);
      } else {
        await navigator.clipboard.writeText(`${text} — ${url}`);
        setShared("clipboard");
      }
    } catch (err) {
      // Användaren avbröt delningen själv – ingen felsignal.
      if ((err as { name?: string })?.name === "AbortError") return;
      /* övriga fel: tyst */
    }
  }

  function currentSnapshot(): RunSnapshot {
    const top = result.ranked.matches[0];
    return {
      id: runId,
      mode,
      seed: runSeed,
      topPartyId: top?.partyId ?? null,
      topPartyName: top?.partyName ?? null,
      topPercent: top?.percent ?? null,
      topThree: result.ranked.matches.slice(0, 3).map((m) => m.partyId),
      coords: result.userCoords,
      answeredCount,
    };
  }

  function recordRun() {
    if (answeredCount === 0) return;
    const snapshot = currentSnapshot();
    setHistory((prev) => [snapshot, ...prev.filter((h) => h.id !== snapshot.id)].slice(0, 8));
  }

  function showResults() {
    recordRun();
    setStep(sections.length);
  }

  function resetRun(nextSeed?: string) {
    setAnswers({});
    setComments({});
    setComment("");
    setCommentOpen({});
    setConsent(false);
    setShared(false);
    setExpanded(null);
    setAi({ loading: false, analysis: null, note: null, error: null });
    setRunId(crypto.randomUUID());
    if (nextSeed) setRunSeed(nextSeed);
    setStarted(true);
    setStep(0);
  }

  function overlap(a: readonly string[], b: readonly string[]): number {
    const set = new Set(a);
    return b.filter((id) => set.has(id)).length;
  }

  function coordDistance(a: Coordinates, b: Coordinates): number | null {
    if (a.economic == null || a.galtan == null || b.economic == null || b.galtan == null) return null;
    return Math.sqrt((a.economic - b.economic) ** 2 + (a.galtan - b.galtan) ** 2);
  }

  // Textbeskrivning av en kartposition för skärmläsare (axel + riktning).
  function mapPosText(c: Coordinates): string {
    const econ = lean(c.economic, "till höger", "till vänster") ?? "okänt på ekonomiaxeln";
    const gal = lean(c.galtan, "mot auktoritärt (TAN)", "mot frihetligt (GAL)") ?? "okänt på värderingsaxeln";
    const econPart = c.economic == null ? "ekonomiskt okänd" : `ekonomiskt ${econ}`;
    const galPart = c.galtan == null ? "värderingsmässigt okänd" : `värderingsmässigt ${gal}`;
    return `${econPart}, ${galPart}`;
  }

  // ---------- intro ----------
  if (!started) {
    return (
      <main className="container">
        <span className="tag">Riksdagsvalet 13 september 2026</span>
        <h1 ref={headingRef} tabIndex={-1}>Valkompass 2026</h1>
        <p className="lead">
          Välj testlängd och få ett balanserat urval ur en frågebank med {plan.totalQuestionGroups} sakfrågegrupper
          och {plan.totalFormulations} godkända formuleringar. Du kan göra om samma test eller ta en ny variant
          och jämföra om du hamnar ungefär på samma plats.
        </p>
        <div className="modegrid" role="radiogroup" aria-label="Välj testlängd">
          {TEST_MODES.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`modebtn${mode === m.id ? " on" : ""}`}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              <strong>{m.label}</strong>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
        <p className="meta">
          Den här körningen innehåller {total} frågor. Frågor inom samma sakfrågegrupp blandas inte i samma test.
        </p>
        {!isPublished && (
          <div className="note">
            Partipositionerna är AI-researchade utkast (från partiprogram, press och riksdagsdata) under
            expertgranskning – inte slutgiltigt fastställda.
          </div>
        )}
        <p style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>Starta kompassen →</button>
        </p>
        <p className="meta" style={{ marginTop: 12 }}>
          Vägledande verktyg, inte en rekommendation att rösta på ett visst parti.
        </p>
      </main>
    );
  }

  // ---------- resultat ----------
  if (step >= sections.length) {
    const C = 170, R = 140;
    const px = (e: number | null | undefined) => C + (e ?? 0) * R;
    const py = (g: number | null | undefined) => C - (g ?? 0) * R;
    const econLean = lean(result.userCoords.economic, "åt höger", "åt vänster");
    const galLean = lean(result.userCoords.galtan, "mot det auktoritära (TAN)", "mot det frihetliga (GAL)");
    const snapshot = currentSnapshot();
    const previous = history.find((h) => h.id !== snapshot.id);
    const topOverlap = previous ? overlap(snapshot.topThree, previous.topThree) : 0;
    const distance = previous ? coordDistance(snapshot.coords, previous.coords) : null;
    const stable =
      previous &&
      (snapshot.topPartyId === previous.topPartyId || topOverlap >= 2) &&
      (distance == null || distance <= 0.35);

    return (
      <main className="container">
        <ProgressHeader headingRef={headingRef} title="Resultat" answeredCount={answeredCount} total={total} />
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" onClick={() => setStep(Math.max(0, sections.length - 1))}>← Ändra svar</button>
          <span className="result-actions">
            <button type="button" className="btn" onClick={() => resetRun()}>Gör om samma test</button>
            <button type="button" className="btn" onClick={() => resetRun(crypto.randomUUID())}>Ny variant</button>
            <button type="button" className="btn btn-primary" onClick={share}>{shared === "shared" ? "Delat ✓" : shared === "clipboard" ? "Kopierat ✓" : "Dela resultat"}</button>
          </span>
        </div>

        {answeredCount === 0 ? (
          <p className="muted">Du har inte svarat på någon fråga ännu. Gå tillbaka och svara på minst en.</p>
        ) : (
          <>
            <div className="results">
              <h2>Din matchning</h2>
              {!isPublished && (
                <div className="note">
                  Partipositionerna bakom matchningen är AI-researchade utkast under expertgranskning – inte
                  slutgiltigt fastställda. Tolka resultatet därefter.
                </div>
              )}
              <p className="meta">
                {plan.mode.label}: {answeredCount}/{total} frågor besvarade. Varianten är balanserad över ämnen och axlar.
              </p>
              {previous ? (
                <div className={`stability ${stable ? "stable" : "sensitive"}`}>
                  <strong>{stable ? "Stabilt jämfört med förra körningen" : "Resultatet rörde sig jämfört med förra körningen"}</strong>
                  <span>
                    Förra toppen: {previous.topPartyName ?? "okänd"}{previous.topPercent == null ? "" : ` ${previous.topPercent} %`}.{" "}
                    Topp 3-överlapp: {topOverlap}/3{distance == null ? "." : `. Kartavstånd: ${distance.toFixed(2)}.`}
                  </span>
                </div>
              ) : (
                <div className="stability">
                  <strong>Vill du testa stabiliteten?</strong>
                  <span>Ta en ny variant efter detta resultat. Då jämförs topp 3 och kartpositionen här.</span>
                </div>
              )}
              {result.ranked.isClose && (
                <p className="close">Det är jämnt i toppen ({result.ranked.topGap} procentenheter mellan de två högsta) – tolka inte ettan som ett facit.</p>
              )}
              {result.ranked.matches.map((m, i) => {
                const pct = m.percent ?? 0;
                const open = expanded === m.partyId;
                const color = PARTY_COLORS[m.partyId] ?? "var(--accent)";
                const bd = [...m.breakdown].sort((a, b) => b.agreement - a.agreement);
                return (
                  <div className={`row${i === 0 ? " top" : ""}`} key={m.partyId}>
                    <button type="button" className="rowhead" aria-expanded={open} onClick={() => setExpanded(open ? null : m.partyId)}>
                      <span className="dot" style={{ background: color }} />
                      <span className="pname">{m.partyName}</span>
                      <span className="pct">{m.percent === null ? "–" : `${pct} %`}</span>
                      <span className="chev">{open ? "▴" : "▾"}</span>
                    </button>
                    <div className="bartrack"><div className="barfill" style={{ width: `${pct}%`, background: color }} /></div>
                    {open && (
                      <div className="breakdown">
                        <p className="meta">Baserat på {m.answeredCount} frågor. Sorterat efter störst överensstämmelse.</p>
                        {bd.map((b) => {
                          const ag = agree(b.agreement);
                          const src = sources[`${m.partyId}::${b.questionId}`];
                          return (
                            <div className="bdrow" key={b.questionId}>
                              <span className={`agchip ${ag.c}`}>{ag.t}</span>
                              <span className="bdq">{qText[b.questionId]}</span>
                              {src && <a className="srclink" href={src.url} target="_blank" rel="noopener noreferrer" title={src.label}>källa ↗</a>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="meta" style={{ marginTop: 14 }}>Metod: {method}. Klicka på ett parti för att se var ni är överens och skiljer er åt, med källa.</p>
              <p className="meta">Överens-etiketterna per fråga visar hur nära din position ligger partiets råposition – de följer inte den valda matchningsmetoden.</p>
              {method === "directional" && (
                <p className="meta">Med metoden Riktning räknas mittenliga svar (neutralt/i mitten) som neutrala av princip och påverkar därför inte matchningen åt något håll.</p>
              )}
            </div>

            <div className="map">
              <h2>Politisk karta</h2>
              {(econLean || galLean) && (
                <p className="lead-sm">Du lutar {econLean ? `ekonomiskt ${econLean}` : "ekonomiskt oklart"}{galLean ? ` och värderingsmässigt ${galLean}` : ""}.</p>
              )}
              <svg viewBox="0 0 340 340" role="img" aria-label="Tvådimensionell politisk karta" aria-describedby="kartbeskrivning">
                <line className="axis" x1={C} y1={28} x2={C} y2={312} />
                <line className="axis" x1={28} y1={C} x2={312} y2={C} />
                <text className="axislabel" x={C} y={20} textAnchor="middle">TAN / auktoritär</text>
                <text className="axislabel" x={C} y={332} textAnchor="middle">GAL / frihetlig</text>
                <text className="axislabel" x={20} y={C - 6} textAnchor="middle">Vänster</text>
                <text className="axislabel" x={320} y={C - 6} textAnchor="middle">Höger</text>
                {partyPoints.map((p) => (
                  <g key={p.id}>
                    <circle cx={px(p.coords.economic)} cy={py(p.coords.galtan)} r={6} fill={PARTY_COLORS[p.id] ?? "#888"} stroke="#fff" strokeWidth={1} />
                    <text x={px(p.coords.economic)} y={py(p.coords.galtan) - 9} textAnchor="middle" className="ptlabel">{p.id}</text>
                  </g>
                ))}
                {(result.userCoords.economic != null || result.userCoords.galtan != null) && (
                  <>
                    <circle cx={px(result.userCoords.economic)} cy={py(result.userCoords.galtan)} r={9} className="userdot" />
                    <text x={px(result.userCoords.economic)} y={py(result.userCoords.galtan) - 12} textAnchor="middle" className="ptlabel" style={{ fontWeight: 700 }}>Du</text>
                  </>
                )}
              </svg>
              {/* Textalternativ till kartan: var varje parti och användaren ligger på de två axlarna. */}
              <div id="kartbeskrivning" className="sr-only">
                <p>Politisk karta med två axlar: vänster–höger (ekonomi) och GAL/frihetlig–TAN/auktoritär (värderingar).</p>
                <ul>
                  {partyPoints.map((p) => (
                    <li key={p.id}>
                      {p.name} ({p.id}): {mapPosText(p.coords)}.
                    </li>
                  ))}
                  <li>
                    Din position: {mapPosText(result.userCoords)}.
                  </li>
                </ul>
              </div>
              <div className="legend">
                {result.ranked.matches.map((m) => (
                  <span className="legitem" key={m.partyId}>
                    <span className="swatch" style={{ background: PARTY_COLORS[m.partyId] ?? "#888" }} aria-hidden="true" />
                    {/* Parti-id i text intill färgrutan så att identiteten inte bara förmedlas via färg. */}
                    <span className="legid">{m.partyId}</span> {m.partyName}
                  </span>
                ))}
              </div>
            </div>

            <div className="comment">
              <h2 id="kommentar-rubrik">Kommentera ditt val</h2>
              <p className="meta">Dina kommentarer tolkas av AI som ett additivt lager – de ändrar aldrig matchningssiffran. Kommentera enskilda frågor inne i testet, och/eller skriv en övergripande kommentar här.</p>
              {Object.entries(comments).filter(([, t]) => t.trim()).length > 0 && (
                <div className="qcomments-summary">
                  <p className="meta">Dina frågekommentarer (vägs in i analysen):</p>
                  <ul>
                    {Object.entries(comments).filter(([, t]) => t.trim()).map(([id, t]) => (
                      <li key={id}><strong>{qText[id]}</strong> — {t}</li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea className="commentbox" aria-labelledby="kommentar-rubrik" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Övergripande kommentar (valfritt) – vad är viktigast för dig, och varför?" rows={4} />
              <label className="consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Jag samtycker till att mina kommentarer och svar i denna analys – som kan avslöja politiska åsikter –
                  behandlas och lagras till efter valdagen (13 september 2026) och då raderas. Texten skickas till och
                  tolkas av AI-leverantören Anthropic, vilket kan innebära överföring till USA. Frivilligt; kan
                  återkallas. Läs mer i vår <a href="/integritet">integritetspolicy</a>. (GDPR art. 9)
                </span>
              </label>
              <button type="button" className="btn btn-primary" onClick={submitComment} aria-busy={ai.loading} disabled={ai.loading || !consent || commentItems().length === 0}>
                {ai.loading ? "Analyserar…" : "Analysera kommentarer"}
              </button>
              {/* Diskret, artig live-region som annonserar AI-status för skärmläsare. */}
              <p className="sr-only" role="status" aria-live="polite">
                {ai.loading ? "Analyserar…" : ai.analysis ? "Analys klar" : ""}
              </p>
              {ai.error && <p className="close" role="alert">{ai.error}</p>}
              {ai.note && <p className="meta">{ai.note}</p>}
              {ai.analysis && (
                <div className="analysis">
                  <span className="aibadge">AI-genererad tolkning</span>
                  <p>{ai.analysis.summary}</p>
                  {ai.analysis.themes.length > 0 && (
                    <p className="chips">{ai.analysis.themes.map((t) => <span className="chip" key={t}>{t}</span>)}</p>
                  )}
                  <p className="meta">Ton: {ai.analysis.sentiment}</p>
                  <div className="influencebox">
                    <h3>Så påverkade kommentarerna</h3>
                    <p className="meta">Kommentarerna ändrade inte matchningsprocenten eller partiernas rangordning. De påverkade bara den AI-genererade tolkningen nedan.</p>
                    {ai.analysis.commentInfluences.length > 0 ? (
                      <div className="influences">
                        {ai.analysis.commentInfluences.map((impact, i) => {
                          const affected = impact.affectedQuestionIds.map((id) => qText[id]).filter(Boolean);
                          const source = impact.sourceQuestionId ? qText[impact.sourceQuestionId] : null;
                          return (
                            <div className="influence" key={`${impact.effect}-${i}`}>
                              <strong>{INFLUENCE[impact.effect] ?? "Påverkade"} AI-tolkningen</strong>
                              <span>{impact.note}</span>
                              {source && <span className="meta">Kommentar till: {source}</span>}
                              {affected.length > 0 && <span className="meta">Kopplades till: {affected.join(" · ")}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="meta">AI:n hittade ingen tydlig extra påverkan utöver sammanfattningen.</p>
                    )}
                  </div>
                  {ai.analysis.policySignals.length > 0 && (
                    <div className="signals">
                      {ai.analysis.policySignals.map((s, i) => (
                        <div className="signal" key={i}>
                          <strong>{DIMLABEL[s.dimension] ?? s.dimension}: {LEANING[s.leaning] ?? s.leaning}</strong>
                          <span className="meta"> – {s.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ai.analysis.relatedQuestionIds.length > 0 && (
                    <p className="meta">Berör frågor: {ai.analysis.relatedQuestionIds.map((id) => qText[id]).filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              )}
              {/* Samtyckeskvitto: din beständiga referens, som kan användas för att begära radering. */}
              <div className="receipt">
                <p className="meta">
                  Din referens: <code className="refcode">{sessionId}</code>
                </p>
                <p className="meta">
                  Spara referensen om du senare vill begära radering av dina sparade svar och kommentarer
                  (via <a href="/api/session/delete">/api/session/delete</a>).
                </p>
              </div>
            </div>
          </>
        )}

        <p className="disclaimer">
          Vägledande verktyg, inte en rekommendation att rösta på ett visst parti. Matchningen är deterministisk
          och förklarbar; fritextkommentaren tolkas av AI som ett separat, märkt lager.
        </p>
      </main>
    );
  }

  // ---------- frågesteg ----------
  const section = sections[step]!;
  const sectionQs = section.questions;
  return (
    <main className="container">
      <ProgressHeader
        headingRef={headingRef}
        title={`Avsnitt ${step + 1} av ${sections.length} · ${section.title}`}
        answeredCount={answeredCount}
        total={total}
      />
      <h2 className="sectiontitle">{section.title}</h2>

      {sectionQs.map((q) => {
        const showBox = commentOpen[q.id] || (comments[q.id]?.trim().length ?? 0) > 0;
        return (
          <div className="question" key={q.id}>
            <div className="topic">{q.topic}</div>
            <div className="text">{q.text}</div>
            <Scale
              id={q.id}
              answer={answers[q.id]}
              questionText={qText[q.id] ?? q.id}
              onSetValue={setVal}
              onToggleWeight={toggleWeight}
            />
            <div className="qcomment">
              {showBox ? (
                <textarea
                  className="qcommentbox"
                  aria-label={`Kommentar till: ${q.text}`}
                  placeholder="Din kommentar till frågan (valfritt) – vägs in i AI-analysen…"
                  rows={2}
                  value={comments[q.id] ?? ""}
                  onChange={(e) => setComments((s) => ({ ...s, [q.id]: e.target.value }))}
                />
              ) : (
                <button type="button" className="linkbtn" onClick={() => setCommentOpen((s) => ({ ...s, [q.id]: true }))}>
                  + Kommentera frågan
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="stepnav">
        <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Föregående</button>
        {step < sections.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Nästa →</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={showResults}>Visa resultat →</button>
        )}
      </div>
      {answeredCount > 0 && (
        <p style={{ textAlign: "center", marginTop: 10 }}>
          <button type="button" className="linkbtn" onClick={showResults}>Hoppa till resultat ({answeredCount}/{total})</button>
        </p>
      )}

      <div className="toolbar" style={{ marginTop: 24 }}>
        <button type="button" className="linkbtn" onClick={() => setAdvanced((v) => !v)}>{advanced ? "Dölj avancerat" : "Avancerat"}</button>
        {advanced && (
          <label className="meta">
            Matchningsmetod:{" "}
            <select value={method} onChange={(e) => setMethod(e.target.value as MatchMethod)}>
              {METHODS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>
    </main>
  );
}
