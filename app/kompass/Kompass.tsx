"use client";

import { useMemo, useState } from "react";

import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import type { PublishedCatalog } from "@/src/catalog/types.ts";
import { partyCoordinates, rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { MatchMethod, Party, Scale } from "@/src/matching/types.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";

interface Props {
  catalog: PublishedCatalog;
  parties: Party[];
  scale: Scale;
}

interface AnswerState {
  value: number | null; // i visningsrymden; null = vet ej
  weight: number;
}

const OPTIONS = [
  { v: 2, label: "Instämmer helt" },
  { v: 1, label: "Instämmer delvis" },
  { v: 0, label: "Neutral" },
  { v: -1, label: "Tar delvis avstånd" },
  { v: -2, label: "Tar helt avstånd" },
];

const METHODS: { v: MatchMethod; label: string }[] = [
  { v: "hybrid", label: "Hybrid (rekommenderad)" },
  { v: "cityblock", label: "City-block" },
  { v: "directional", label: "Riktning" },
  { v: "euclidean", label: "Euclidean" },
];

export default function Kompass({ catalog, parties, scale }: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [method, setMethod] = useState<MatchMethod>("hybrid");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState<{
    loading: boolean;
    analysis: CommentAnalysis | null;
    note: string | null;
    error: string | null;
  }>({ loading: false, analysis: null, note: null, error: null });

  const questions = useMemo(() => toMatchingQuestions(catalog), [catalog]);

  const setVal = (id: string, value: number | null) =>
    setAnswers((s) => ({ ...s, [id]: { value, weight: s[id]?.weight ?? 1 } }));

  const toggleWeight = (id: string) =>
    setAnswers((s) => ({
      ...s,
      [id]: { value: s[id]?.value ?? null, weight: (s[id]?.weight ?? 1) === 2 ? 1 : 2 },
    }));

  const answeredCount = Object.values(answers).filter((a) => a.value !== null).length;

  async function submitComment() {
    if (!comment.trim()) return;
    if (!consent) {
      setAi({ loading: false, analysis: null, note: null, error: "Du måste samtycka för att skicka kommentaren." });
      return;
    }
    setAi({ loading: true, analysis: null, note: null, error: null });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          method,
          answers: Object.fromEntries(
            Object.entries(answers).map(([id, a]) => [id, { value: a.value, weight: a.weight }]),
          ),
          comment,
          consent: { article9: true, bannerVersion: "v1" },
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        analysis?: CommentAnalysis | null;
        analysisNote?: string | null;
      };
      if (!res.ok) {
        setAi({ loading: false, analysis: null, note: null, error: data.error ?? "Något gick fel." });
        return;
      }
      setAi({ loading: false, analysis: data.analysis ?? null, note: data.analysisNote ?? null, error: null });
    } catch {
      setAi({ loading: false, analysis: null, note: null, error: "Nätverksfel." });
    }
  }

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

  // 2D-karta: economic = x, galtan = y; [-1,1] → svg.
  const C = 160;
  const R = 130;
  const px = (econ: number | null | undefined) => C + (econ ?? 0) * R;
  const py = (gal: number | null | undefined) => C - (gal ?? 0) * R;

  return (
    <main className="container">
      <span className="tag">Demo</span>
      <h1>Valkompass 2026</h1>
      <p className="muted">
        Svara på påståendena. Matchningen räknas direkt och deterministiskt — du kan byta metod
        och se hur resultatet ändras.
      </p>

      <div className="note">
        Partipositionerna är AI-researchade utkast (från partiprogram, press och riksdagsdata) under
        expertgranskning – inte slutgiltigt fastställda. Källa per ståndpunkt visas i granskningsläget.
      </div>

      {catalog.questions.map((q) => {
        const a = answers[q.id];
        return (
          <div className="question" key={q.id}>
            <div className="topic">{q.topic}</div>
            <div className="text">{q.text}</div>
            <div className="scale">
              {OPTIONS.map((o) => (
                <button
                  key={o.v}
                  className={`opt${a && a.value === o.v ? " selected" : ""}`}
                  onClick={() => setVal(q.id, o.v)}
                  type="button"
                >
                  {o.label}
                </button>
              ))}
              <button
                className={`opt vetej${a && a.value === null ? " selected" : ""}`}
                onClick={() => setVal(q.id, null)}
                type="button"
              >
                Vet ej
              </button>
            </div>
            <div className="weight">
              <span>Vikt:</span>
              <span
                className={`chip${(a?.weight ?? 1) === 2 ? " on" : ""}`}
                onClick={() => toggleWeight(q.id)}
                role="button"
              >
                {(a?.weight ?? 1) === 2 ? "Extra viktig ✓" : "Markera som extra viktig"}
              </span>
            </div>
          </div>
        );
      })}

      <div className="toolbar">
        <label>
          Matchningsmetod:{" "}
          <select value={method} onChange={(e) => setMethod(e.target.value as MatchMethod)}>
            {METHODS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {answeredCount === 0 ? (
        <p className="muted">Svara på minst en fråga för att se din matchning.</p>
      ) : (
        <>
          <div className="results">
            <h2>Din matchning</h2>
            {result.ranked.isClose && (
              <p className="close">
                Det är jämnt i toppen ({result.ranked.topGap} procentenheter mellan de två högsta) —
                tolka inte ettan som ett facit.
              </p>
            )}
            {result.ranked.matches.map((m, i) => {
              const pct = m.percent ?? 0;
              return (
                <div className={`row${i === 0 ? " top" : ""}`} key={m.partyId}>
                  <div className="label">
                    <span>{m.partyName}</span>
                    <span className="pct">{m.percent === null ? "–" : `${pct} %`}</span>
                  </div>
                  <div className="bartrack">
                    <div className="barfill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="meta" style={{ marginTop: 14 }}>
              Baserat på {answeredCount} av {catalog.questions.length} besvarade frågor. Metod: {method}.
            </p>
          </div>

          <div className="map">
            <h2>Politisk karta</h2>
            <p className="meta">Vågrätt: ekonomisk vänster–höger. Lodrätt: GAL–TAN (värderingar).</p>
            <svg viewBox="0 0 320 320" role="img" aria-label="Tvådimensionell politisk karta">
              <line className="axis" x1={C} y1={30} x2={C} y2={290} />
              <line className="axis" x1={30} y1={C} x2={290} y2={C} />
              <text className="axislabel" x={C} y={24} textAnchor="middle">TAN</text>
              <text className="axislabel" x={C} y={304} textAnchor="middle">GAL</text>
              <text className="axislabel" x={24} y={C - 6} textAnchor="middle">Vänster</text>
              <text className="axislabel" x={296} y={C - 6} textAnchor="middle">Höger</text>
              {partyPoints.map((p) => (
                <g key={p.id}>
                  <circle className="partydot" cx={px(p.coords.economic)} cy={py(p.coords.galtan)} r={4} />
                  <text className="partylabel" x={px(p.coords.economic) + 6} y={py(p.coords.galtan) + 3}>
                    {p.id}
                  </text>
                </g>
              ))}
              {(result.userCoords.economic != null || result.userCoords.galtan != null) && (
                <circle
                  className="userdot"
                  cx={px(result.userCoords.economic)}
                  cy={py(result.userCoords.galtan)}
                  r={6}
                />
              )}
            </svg>
            <p className="meta">Grön punkt = du. Bokstäver = partier (demo-positioner).</p>
          </div>

          <div className="comment">
            <h2>Kommentera ditt val</h2>
            <p className="meta">
              Din kommentar tolkas av AI som ett additivt lager — den ändrar aldrig matchningssiffran.
            </p>
            <textarea
              className="commentbox"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Vad är viktigast för dig, och varför?"
              rows={4}
            />
            <label className="consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Jag samtycker till att min kommentar – som kan avslöja politiska åsikter – analyseras och
                lagras till efter valdagen (13 september 2026) och då raderas. Frivilligt; kan återkallas. (GDPR art. 9)
              </span>
            </label>
            <button
              className="btn btn-primary"
              onClick={submitComment}
              disabled={ai.loading || !comment.trim() || !consent}
              type="button"
            >
              {ai.loading ? "Analyserar…" : "Analysera kommentar"}
            </button>
            {ai.error && <p className="close">{ai.error}</p>}
            {ai.note && <p className="meta">{ai.note}</p>}
            {ai.analysis && (
              <div className="analysis">
                <span className="aibadge">AI-genererad tolkning</span>
                <p>{ai.analysis.summary}</p>
                {ai.analysis.themes.length > 0 && (
                  <p className="meta">Teman: {ai.analysis.themes.join(", ")}</p>
                )}
                <p className="meta">Ton: {ai.analysis.sentiment}</p>
              </div>
            )}
          </div>
        </>
      )}

      <p className="disclaimer">
        Vägledande verktyg, inte en rekommendation att rösta på ett visst parti. Matchningen är
        deterministisk och förklarbar; en separat AI-analys av fritextkommentarer tillkommer senare.
      </p>
    </main>
  );
}
