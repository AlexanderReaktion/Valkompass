"use client";

import { useMemo, useState } from "react";

import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import type { CatalogQuestion, PublishedCatalog } from "@/src/catalog/types.ts";
import { partyCoordinates, rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { MatchMethod, Party, Scale } from "@/src/matching/types.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";

interface Props {
  catalog: PublishedCatalog;
  parties: Party[];
  scale: Scale;
  sources: Record<string, { label: string; url: string }>;
}

interface AnswerState {
  value: number | null; // display-space; null = vet ej
  weight: number;
}

const SECTIONS: { title: string; ids: string[] }[] = [
  { title: "Skatter & ekonomi", ids: ["skatt_arbete", "hoginkomstskatt", "bolagsskatt", "kapitalskatt", "offentliga_utgifter", "rutrot", "bensinskatt"] },
  { title: "Välfärd & arbete", ids: ["vinst_valfard", "offentlig_ansvar", "arbetsratt", "akassa", "forsorjningsstod", "pension", "vard_resurser", "friskolor", "vinst_skola"] },
  { title: "Migration & integration", ids: ["arbetskraftsinvandring", "asyl_farre", "flykting_oppen", "medborgarskap", "anpassning", "atervandring", "anhorig", "bistand"] },
  { title: "Lag & ordning", ids: ["straff", "polisbefogenheter", "visitationszoner", "ungdomsstraff", "forebyggande", "integritet"] },
  { title: "Klimat & energi", ids: ["klimat_prioritet", "karnkraft", "vindkraft", "miljoskatter", "reduktionsplikt", "naturskydd"] },
  { title: "Familj, rättigheter & demokrati", ids: ["foraldraforsakring", "abort", "hbtqi", "public_service", "monarki"] },
  { title: "Försvar & EU", ids: ["nato", "forsvarsanslag", "eu_makt", "euro"] },
];

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

function agree(a: number): { t: string; c: string } {
  return a >= 0.8 ? { t: "Överens", c: "ag-high" } : a >= 0.5 ? { t: "Delvis", c: "ag-mid" } : { t: "Oense", c: "ag-low" };
}
function lean(v: number | null | undefined, pos: string, neg: string): string | null {
  if (v == null) return null;
  return v > 0.2 ? pos : v < -0.2 ? neg : "i mitten";
}

export default function Kompass({ catalog, parties, scale, sources }: Props) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0); // 0..SECTIONS.length-1 = section; ===length = resultat
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [method, setMethod] = useState<MatchMethod>("hybrid");
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({}); // per-fråga
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [consent, setConsent] = useState(false);
  const [shared, setShared] = useState(false);
  const [ai, setAi] = useState<{ loading: boolean; analysis: CommentAnalysis | null; note: string | null; error: string | null }>({
    loading: false, analysis: null, note: null, error: null,
  });

  const questions = useMemo(() => toMatchingQuestions(catalog), [catalog]);
  const qText = useMemo(() => Object.fromEntries(catalog.questions.map((q) => [q.id, q.text])), [catalog]);
  const qById = useMemo(() => Object.fromEntries(catalog.questions.map((q) => [q.id, q])) as Record<string, CatalogQuestion>, [catalog]);
  const total = catalog.questions.length;

  const setVal = (id: string, value: number | null) =>
    setAnswers((s) => ({ ...s, [id]: { value, weight: s[id]?.weight ?? 1 } }));
  const toggleWeight = (id: string) =>
    setAnswers((s) => ({ ...s, [id]: { value: s[id]?.value ?? null, weight: (s[id]?.weight ?? 1) === 2 ? 1 : 2 } }));

  const answeredCount = Object.values(answers).filter((a) => a.value !== null).length;

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
          answers: Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, { value: a.value, weight: a.weight }])),
          comments: items, consent: { article9: true, bannerVersion: "v1" },
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
      if (typeof navigator !== "undefined" && navigator.share) await navigator.share({ title: "Valkompass 2026", text, url });
      else { await navigator.clipboard.writeText(`${text} — ${url}`); setShared(true); }
    } catch { /* avbrutet */ }
  }

  // ---------- kompakt skala ----------
  function Scale({ id }: { id: string }) {
    const a = answers[id];
    const selected = a && a.value !== null ? a.value : null;
    const vetej = a !== undefined && a.value === null;
    const caption = vetej ? "Vet ej" : selected !== null ? SCALE_OPTS.find((o) => o.v === selected)?.label : "Inte besvarad";
    return (
      <div className="scale2">
        <div className="segrow" role="radiogroup" aria-label="Hur mycket instämmer du?">
          <span className="endlabel">Tar avstånd</span>
          {SCALE_OPTS.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={selected === o.v}
              aria-label={o.label}
              title={o.label}
              className={`seg${selected === o.v ? " on" : ""}`}
              onClick={() => setVal(id, o.v)}
            />
          ))}
          <span className="endlabel">Instämmer</span>
        </div>
        <div className="scalefoot">
          <span className={`caption${selected !== null ? " set" : ""}`}>{caption}</span>
          <span className="footactions">
            <button type="button" className={`linkbtn${vetej ? " on" : ""}`} onClick={() => setVal(id, null)}>Vet ej</button>
            <button type="button" className={`star${(a?.weight ?? 1) === 2 ? " on" : ""}`} aria-pressed={(a?.weight ?? 1) === 2} onClick={() => toggleWeight(id)} title="Markera som extra viktig">
              ★ Viktig
            </button>
          </span>
        </div>
      </div>
    );
  }

  function ProgressHeader() {
    return (
      <div className="progress">
        <div className="progresshead">
          <span>{step < SECTIONS.length ? `Avsnitt ${step + 1} av ${SECTIONS.length} · ${SECTIONS[step]?.title}` : "Resultat"}</span>
          <span className="meta">{answeredCount}/{total} besvarade</span>
        </div>
        <div className="progresstrack"><div className="progressfill" style={{ width: `${(answeredCount / total) * 100}%` }} /></div>
      </div>
    );
  }

  // ---------- intro ----------
  if (!started) {
    return (
      <main className="container">
        <span className="tag">Riksdagsvalet 13 september 2026</span>
        <h1>Valkompass 2026</h1>
        <p className="lead">
          {total} sakfrågor, ca 5 minuter. Du kan hoppa över frågor och markera de som är extra viktiga.
          Resultatet räknas fram deterministiskt och visar både en topplista och en politisk karta i två
          dimensioner – med källa bakom varje partis ståndpunkt.
        </p>
        <div className="note">
          Partipositionerna är AI-researchade utkast (från partiprogram, press och riksdagsdata) under
          expertgranskning – inte slutgiltigt fastställda.
        </div>
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
  if (step >= SECTIONS.length) {
    const C = 170, R = 140;
    const px = (e: number | null | undefined) => C + (e ?? 0) * R;
    const py = (g: number | null | undefined) => C - (g ?? 0) * R;
    const econLean = lean(result.userCoords.economic, "åt höger", "åt vänster");
    const galLean = lean(result.userCoords.galtan, "mot det auktoritära (TAN)", "mot det frihetliga (GAL)");

    return (
      <main className="container">
        <ProgressHeader />
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" onClick={() => setStep(SECTIONS.length - 1)}>← Ändra svar</button>
          <button type="button" className="btn btn-primary" onClick={share}>{shared ? "Kopierat ✓" : "Dela resultat"}</button>
        </div>

        {answeredCount === 0 ? (
          <p className="muted">Du har inte svarat på någon fråga ännu. Gå tillbaka och svara på minst en.</p>
        ) : (
          <>
            <div className="results">
              <h2>Din matchning</h2>
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
            </div>

            <div className="map">
              <h2>Politisk karta</h2>
              {(econLean || galLean) && (
                <p className="lead-sm">Du lutar {econLean ? `ekonomiskt ${econLean}` : "ekonomiskt oklart"}{galLean ? ` och värderingsmässigt ${galLean}` : ""}.</p>
              )}
              <svg viewBox="0 0 340 340" role="img" aria-label="Tvådimensionell politisk karta">
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
              <div className="legend">
                {result.ranked.matches.map((m) => (
                  <span className="legitem" key={m.partyId}>
                    <span className="swatch" style={{ background: PARTY_COLORS[m.partyId] ?? "#888" }} />
                    {m.partyName}
                  </span>
                ))}
              </div>
            </div>

            <div className="comment">
              <h2>Kommentera ditt val</h2>
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
              <textarea className="commentbox" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Övergripande kommentar (valfritt) – vad är viktigast för dig, och varför?" rows={4} />
              <label className="consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Jag samtycker till att mina kommentarer – som kan avslöja politiska åsikter – analyseras och lagras till efter valdagen (13 september 2026) och då raderas. Frivilligt; kan återkallas. (GDPR art. 9)</span>
              </label>
              <button type="button" className="btn btn-primary" onClick={submitComment} disabled={ai.loading || !consent || commentItems().length === 0}>
                {ai.loading ? "Analyserar…" : "Analysera kommentarer"}
              </button>
              {ai.error && <p className="close">{ai.error}</p>}
              {ai.note && <p className="meta">{ai.note}</p>}
              {ai.analysis && (
                <div className="analysis">
                  <span className="aibadge">AI-genererad tolkning</span>
                  <p>{ai.analysis.summary}</p>
                  {ai.analysis.themes.length > 0 && (
                    <p className="chips">{ai.analysis.themes.map((t) => <span className="chip" key={t}>{t}</span>)}</p>
                  )}
                  <p className="meta">Ton: {ai.analysis.sentiment}</p>
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
  const section = SECTIONS[step]!;
  const sectionQs = section.ids.map((id) => qById[id]).filter(Boolean);
  return (
    <main className="container">
      <ProgressHeader />
      <h2 className="sectiontitle">{section.title}</h2>

      {sectionQs.map((q) => {
        const showBox = commentOpen[q.id] || (comments[q.id]?.trim().length ?? 0) > 0;
        return (
          <div className="question" key={q.id}>
            <div className="topic">{q.topic}</div>
            <div className="text">{q.text}</div>
            <Scale id={q.id} />
            <div className="qcomment">
              {showBox ? (
                <textarea
                  className="qcommentbox"
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
        {step < SECTIONS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Nästa →</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setStep(SECTIONS.length)}>Visa resultat →</button>
        )}
      </div>
      {answeredCount > 0 && (
        <p style={{ textAlign: "center", marginTop: 10 }}>
          <button type="button" className="linkbtn" onClick={() => setStep(SECTIONS.length)}>Hoppa till resultat ({answeredCount}/{total})</button>
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
