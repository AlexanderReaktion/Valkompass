"use client";

import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { toMatchingQuestions } from "@/src/catalog/catalog.ts";
import type { PublishedCatalog } from "@/src/catalog/types.ts";
import { matchPartyByDimension, partyCoordinates, rankParties, userCoordinates } from "@/src/matching/engine.ts";
import { toCanonicalAnswers } from "@/src/matching/intake.ts";
import type { DisplayAnswers } from "@/src/matching/intake.ts";
import type { Coordinates, MatchMethod, Party, Scale } from "@/src/matching/types.ts";
import type { CommentAnalysis } from "@/src/analysis/types.ts";
import { TEST_MODES, buildTestPlan, uniqueGroupQuestions } from "@/src/kompass/testPlan.ts";
import type { TestModeId } from "@/src/kompass/testPlan.ts";
import { stanceLabel } from "@/src/kompass/stance.ts";
import { RUN_STATE_VERSION, decodeRunState, encodeRunState } from "@/src/kompass/permalink.ts";
import { MAX_COMMENT_LENGTH, charCounterLabel, excludedCommentSummary, sentimentLabel } from "@/src/kompass/analysisView.ts";
import {
  ANALYSIS_STORE_KEY,
  ANALYSIS_STORE_VERSION,
  SESSION_STORAGE_KEY,
  answersFingerprint,
  isAnalysisStale,
  parseStoredAnalysis,
  runFingerprint,
  serializeStoredAnalysis,
} from "@/src/kompass/analysisStorage.ts";
import type { AnswerTuple, StoredAnalysis } from "@/src/kompass/analysisStorage.ts";

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
const DIMLABEL: Record<string, string> = { economic: "Ekonomi", galtan: "Värderingar", none: "Övriga frågor" };
const INFLUENCE: Record<string, string> = {
  reinforces_answer: "Förstärkte",
  nuances_answer: "Nyanserade",
  adds_priority: "Prioriterade",
  signals_tension: "Visade spänning",
  unclear: "Oklar effekt",
};

/** Uppviktning för ämnen användaren markerat som extra viktiga. */
const TOPIC_BOOST = 1.5;
const HISTORY_KEY = "kompass-history-v1";
/** Klienttimeout för AI-anropet – något över serverns maxDuration (120 s). */
const ANALYZE_TIMEOUT_MS = 150_000;

/** Tillstånd för AI-tolkningen, inkl. runId (idempotent retry) och fingeravtryck (stale). */
interface AiState {
  loading: boolean;
  analysis: CommentAnalysis | null;
  note: string | null;
  error: string | null;
  /** runId för senaste körningen; återanvänds vid "Försök igen" så servern inte dubblerar rader. */
  runId: string | null;
  excluded: readonly { questionId: string | null }[];
  /** Avtryck av svar+kommentarer när analysen skapades – för stale-detektering. */
  fingerprint: string | null;
}

const AI_IDLE: AiState = { loading: false, analysis: null, note: null, error: null, runId: null, excluded: [], fingerprint: null };

/** Teckenräknare för kommentarfält – syns först nära maxgränsen. */
function CharCount({ length }: { length: number }) {
  const label = charCounterLabel(length);
  return label ? <span className="charcount">{label}</span> : null;
}

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
  commentCount,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  answeredCount: number;
  total: number;
  commentCount: number;
}) {
  return (
    <div className="progress">
      <div className="progresshead">
        {/* Kontextuell h1: byts mellan frågestegen och resultatet; tar emot fokus vid stegbyte. */}
        <h1 ref={headingRef} tabIndex={-1} className="progresstitle">{title}</h1>
        <span className="meta">
          {answeredCount}/{total} besvarade{commentCount > 0 ? ` · 💬 ${commentCount}` : ""}
        </span>
      </div>
      {/* Visuell stapel döljs för skärmläsare – siffran ovan säger redan samma sak. */}
      <div className="progresstrack" aria-hidden="true"><div className="progressfill" style={{ width: `${(answeredCount / total) * 100}%` }} /></div>
    </div>
  );
}

function loadHistory(): RunSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RunSnapshot[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export default function Kompass({ catalog, parties, scale, sources, isPublished }: Props) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0); // 0..sections.length-1 = section; >=length = resultat
  const [mode, setMode] = useState<TestModeId>("standard");
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [runSeed, setRunSeed] = useState(() => crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [boosts, setBoosts] = useState<ReadonlySet<string>>(() => new Set());
  const [method, setMethod] = useState<MatchMethod>("hybrid");
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});
  // Beständig sessionsreferens: stabil över omladdningar så användaren kan begära radering.
  const [sessionId] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) return saved;
      const fresh = crypto.randomUUID();
      localStorage.setItem(SESSION_STORAGE_KEY, fresh);
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
  const [ai, setAi] = useState<AiState>(AI_IDLE);
  // Historik överlever sidladdning: "gör om och jämför" är kompassens kärnlöfte.
  const [history, setHistory] = useState<RunSnapshot[]>(loadHistory);

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
  const qMeta = useMemo(() => new Map(catalog.questions.map((q) => [q.id, q])), [catalog]);
  const qText = useMemo(() => Object.fromEntries(catalog.questions.map((q) => [q.id, q.text])), [catalog]);
  const total = plan.selectedQuestions.length;

  const sectionTitleByQuestion = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sections) for (const q of s.questions) m[q.id] = s.title;
    return m;
  }, [sections]);
  const effWeight = (id: string, w: number): number =>
    boosts.has(sectionTitleByQuestion[id] ?? "") ? w * TOPIC_BOOST : w;

  const setVal = (id: string, value: number | null) =>
    setAnswers((s) => ({ ...s, [id]: { value, weight: s[id]?.weight ?? 1 } }));
  const toggleWeight = (id: string) =>
    setAnswers((s) => ({ ...s, [id]: { value: s[id]?.value ?? null, weight: (s[id]?.weight ?? 1) === 2 ? 1 : 2 } }));
  const toggleBoost = (title: string) =>
    setBoosts((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const answeredCount = plan.selectedQuestions.filter((q) => answers[q.id]?.value !== null && answers[q.id]?.value !== undefined).length;

  // Kanoniska svar (polaritet speglad, ämnesboost invägd) — delas av matchning,
  // per-dimension-nedbrytning och 2D-kartan så alla vyer bygger på samma siffror.
  const canonical = useMemo(() => {
    const display: DisplayAnswers = Object.fromEntries(
      Object.entries(answers).map(([id, a]) => [id, { value: a.value, weight: effWeight(id, a.weight) }]),
    );
    return toCanonicalAnswers(display, questions, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, boosts, sectionTitleByQuestion, questions, scale]);

  const result = useMemo(
    () => ({
      ranked: rankParties(parties, questions, canonical, scale, method),
      userCoords: userCoordinates(questions, canonical, scale),
    }),
    [canonical, questions, parties, scale, method],
  );

  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  // Partikoordinater beräknas på HELA frågebanken (en formulering per sakfrågegrupp),
  // inte körningens urval — partierna ska ligga still mellan varianter så att
  // "kartavstånd" jämför användarens rörelse, inte urvalets.
  const mapQuestions = useMemo(
    () => toMatchingQuestions({ ...catalog, questions: uniqueGroupQuestions(catalog.questions) }),
    [catalog],
  );
  const partyPoints = useMemo(
    () => parties.map((p) => ({ id: p.id, name: p.name, coords: partyCoordinates(p, mapQuestions, scale) })),
    [parties, mapQuestions, scale],
  );

  const commentItems = () => {
    const items: { questionId?: string; text: string }[] = [];
    for (const [id, text] of Object.entries(comments)) if (text.trim()) items.push({ questionId: id, text });
    if (comment.trim()) items.push({ text: comment });
    return items;
  };
  const commentCount = commentItems().length;

  // Frågor värda att utveckla: stjärnmarkerade först, sedan starka svar — utan kommentar.
  const suggested = useMemo(() => {
    const cands = plan.selectedQuestions.filter((q) => {
      const a = answers[q.id];
      return !!a && a.value !== null && !(comments[q.id]?.trim()) && (a.weight === 2 || Math.abs(a.value) === 2);
    });
    return cands
      .sort((x, y) => {
        const ax = answers[x.id]!;
        const ay = answers[y.id]!;
        const sx = (ax.weight === 2 ? 10 : 0) + Math.abs(ax.value ?? 0);
        const sy = (ay.weight === 2 ? 10 : 0) + Math.abs(ay.value ?? 0);
        return sy - sx;
      })
      .slice(0, 3);
  }, [plan.selectedQuestions, answers, comments]);

  // Frågor som AI-tolkningen kopplade kommentarer till (för 💬-märkning i breakdownen).
  const nuancedIds = useMemo(() => {
    const s = new Set<string>();
    if (ai.analysis) {
      for (const id of ai.analysis.relatedQuestionIds) s.add(id);
      for (const imp of ai.analysis.commentInfluences) {
        if (imp.sourceQuestionId) s.add(imp.sourceQuestionId);
        for (const id of imp.affectedQuestionIds) s.add(id);
      }
    }
    return s;
  }, [ai.analysis]);

  // ---------- permalink ----------

  // Körningens svar som tupler [värde, vikt] – delas av permalänken och
  // analysens fingeravtryck så båda alltid beskriver samma underlag.
  function answerTuples(): Record<string, AnswerTuple> {
    const a: Record<string, AnswerTuple> = {};
    for (const q of plan.selectedQuestions) {
      const s = answers[q.id];
      if (s) a[q.id] = [s.value, s.weight];
    }
    return a;
  }

  function permalinkFragment(): string {
    return encodeRunState({
      version: RUN_STATE_VERSION,
      mode,
      seed: runSeed,
      method,
      answers: answerTuples(),
      ...(boosts.size > 0 ? { boosts: [...boosts] } : {}),
    });
  }

  // Återställ en delad/omladdad körning från URL-fragmentet (körs en gång vid mount).
  // Fragmentet finns bara i webbläsaren, så detta kan inte göras i SSR/lazy init utan
  // hydration-mismatch — en engångs-setState i mount-effekten är den SSR-säkra vägen.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const m = window.location.hash.match(/^#r=([A-Za-z0-9_-]+)$/);
      if (!m) return;
      const state = decodeRunState(m[1]!);
      if (!state) return;
      /* eslint-disable react-hooks/set-state-in-effect -- avsiktlig engångsåterställning, gated av restoredRef */
      setMode(state.mode);
      setRunSeed(state.seed);
      setMethod(state.method);
      setAnswers(Object.fromEntries(Object.entries(state.answers).map(([id, [value, weight]]) => [id, { value, weight }])));
      if (state.boosts) setBoosts(new Set(state.boosts));
      // Återställ sparad tolkning + kommentarer när de hör till exakt dessa svar.
      // Kommentarerna sparades lokalt först efter inskick med samtycke; länken
      // (fragmentet) förblir svarsenbart – kommentarer och analys lämnar aldrig enheten.
      const stored = parseStoredAnalysis(localStorage.getItem(ANALYSIS_STORE_KEY));
      if (
        stored &&
        stored.catalogVersion === catalog.version &&
        stored.answersFingerprint === answersFingerprint(state.answers)
      ) {
        setComments({ ...stored.comments });
        setComment(stored.overallComment);
        setAi({
          loading: false,
          analysis: stored.analysis,
          note: stored.analysisNote,
          error: null,
          runId: stored.runId,
          excluded: stored.excludedComments,
          fingerprint: stored.runFingerprint,
        });
        // Samtycket återställs medvetet INTE: en ny tolkning är en ny behandling
        // och kräver en ny aktiv bock.
      }
      setStarted(true);
      setStep(Number.MAX_SAFE_INTEGER); // direkt till resultatet; klampas mot sections.length i renderingen
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* trasig länk ignoreras tyst — användaren landar på intron */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engångskörning vid mount (gated av restoredRef)
  }, []);

  // Håll URL-fragmentet i synk på resultatsidan så omladdning/bokmärke/delning
  // alltid pekar på exakt det resultat som visas. replaceState → ingen historikspam.
  const onResults = started && step >= sections.length;
  useEffect(() => {
    if (!onResults || answeredCount === 0) return;
    try {
      window.history.replaceState(null, "", `#r=${permalinkFragment()}`);
    } catch {
      /* t.ex. inbäddad utan history-API — permalink är progressive enhancement */
    }
  });

  // Spara tolkningen + de inskickade kommentarerna lokalt (art. 9: sker först
  // EFTER inskick med uttryckligt samtycke, och enbart på användarens egen enhet).
  function persistAnalysis(state: AiState, fingerprint: string) {
    try {
      const stored: StoredAnalysis = {
        version: ANALYSIS_STORE_VERSION,
        sessionId,
        runId: state.runId,
        answersFingerprint: answersFingerprint(answerTuples()),
        runFingerprint: fingerprint,
        comments: Object.fromEntries(Object.entries(comments).filter(([, t]) => t.trim())),
        overallComment: comment.trim() ? comment : "",
        analysis: state.analysis,
        analysisNote: state.note,
        excludedComments: [...state.excluded],
        catalogVersion: catalog.version,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(ANALYSIS_STORE_KEY, serializeStoredAnalysis(stored));
    } catch {
      /* t.ex. privat läge utan lagring — tolkningen blir sessionslokal */
    }
  }

  async function runAnalysis(analysisRunId: string) {
    const items = commentItems();
    if (items.length === 0 || !consent || ai.loading) return;
    // Fingeravtryck av exakt det underlag som skickas – jämförs senare för stale-markering.
    const fingerprint = runFingerprint(answerTuples(), comments, comment);
    // Tidigare tolkning behålls synlig (stale-markerad) medan den nya skapas.
    setAi((s) => ({ ...s, loading: true, error: null, runId: analysisRunId }));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId, method, runId: analysisRunId,
          answers: Object.fromEntries(plan.selectedQuestions
            .filter((q) => answers[q.id])
            .map((q) => [q.id, { value: answers[q.id]!.value, weight: effWeight(q.id, answers[q.id]!.weight) }])),
          comments: items, consent: { article9: true },
        }),
        // Klienttimeout: landa i fel+retry i stället för att snurra för evigt.
        signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      });
      const data = (await res.json()) as {
        error?: string;
        analysis?: CommentAnalysis | null;
        analysisNote?: string | null;
        excludedComments?: { questionId: string | null }[];
      };
      if (!res.ok) {
        setAi((s) => ({ ...s, loading: false, error: data.error ?? "Något gick fel." }));
        return;
      }
      const next: AiState = {
        loading: false,
        analysis: data.analysis ?? null,
        note: data.analysisNote ?? null,
        error: null,
        runId: analysisRunId,
        excluded: data.excludedComments ?? [],
        fingerprint,
      };
      setAi(next);
      persistAnalysis(next, fingerprint);
    } catch (err) {
      const timedOut = (err as { name?: string })?.name === "TimeoutError" || (err as { name?: string })?.name === "AbortError";
      setAi((s) => ({
        ...s,
        loading: false,
        error: timedOut
          ? "Tolkningen tog för lång tid och avbröts."
          : "Nätverksfel. Kontrollera anslutningen.",
      }));
    }
  }

  // Ny körning = nytt runId. Retry av en misslyckad körning återanvänder runId
  // (idempotent på servern: inga dubblerade rader, AI-anropet kan köras om).
  const submitComment = () => runAnalysis(crypto.randomUUID());
  const retryAnalysis = () => runAnalysis(ai.runId ?? crypto.randomUUID());

  async function share() {
    const top = result.ranked.matches.slice(0, 3).map((m, i) => `${i + 1}. ${m.partyName} ${m.percent ?? "–"}%`).join(" · ");
    const text = `Min valkompass 2026: ${top}`;
    const url = typeof window !== "undefined" ? `${window.location.origin}/kompass#r=${permalinkFragment()}` : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Valkompass 2026", text, url });
        setShared("shared");
        setTimeout(() => setShared(false), 4000);
      } else {
        await navigator.clipboard.writeText(`${text} – ${url}`);
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
    setHistory((prev) => {
      const next = [snapshot, ...prev.filter((h) => h.id !== snapshot.id)].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* t.ex. privat läge utan lagring — historiken blir sessionslokal */
      }
      return next;
    });
  }

  function showResults() {
    recordRun();
    setStep(sections.length);
  }

  function resetRun(nextSeed?: string) {
    recordRun(); // fånga ev. återställd/ändrad körning innan den nollas, så jämförelsen har något att jämföra mot
    setAnswers({});
    setComments({});
    setComment("");
    setCommentOpen({});
    setWhyOpen({});
    setConsent(false);
    setShared(false);
    setExpanded(null);
    setAi(AI_IDLE);
    setRunId(crypto.randomUUID());
    if (nextSeed) setRunSeed(nextSeed);
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* ok */
    }
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

  // Hållning i ord för den visade formuleringen (kanoniskt värde + frågans polaritet).
  function stanceFor(questionId: string, canonicalValue: number): string {
    return stanceLabel(canonicalValue, qMeta.get(questionId)?.polarity ?? 1, scale);
  }

  // ---------- intro ----------
  if (!started) {
    return (
      <main className="container">
        <span className="tag">Riksdagsvalet 13 september 2026</span>
        <h1 ref={headingRef} tabIndex={-1}>Valkompass 2026</h1>
        <p className="lead">
          Välj testlängd och få ett balanserat urval ur en frågebank med {plan.totalQuestionGroups} sakfrågegrupper
          och {plan.totalFormulations} formuleringar. Du kan göra om samma test eller ta en ny variant
          och jämföra om du hamnar ungefär på samma plats.
        </p>
        <p className="lead-sm">
          Du kan också kommentera dina svar i fritext – kommentarerna berikar AI-tolkningen av din profil och
          kräver ett separat samtycke.
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
        <fieldset className="boosts">
          <legend>Vad väger extra tungt för dig? (valfritt)</legend>
          <p className="meta" style={{ margin: "0 0 2px" }}>
            Frågor inom valda områden räknas ×1,5 i matchningen. Du kan också stjärnmarkera enskilda frågor inne i testet.
          </p>
          <div className="chiprow">
            {sections.map((s) => (
              <button
                key={s.title}
                type="button"
                className={`chipbtn${boosts.has(s.title) ? " on" : ""}`}
                aria-pressed={boosts.has(s.title)}
                onClick={() => toggleBoost(s.title)}
              >
                {s.title}
              </button>
            ))}
          </div>
        </fieldset>
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
          Ett vägledande verktyg – hur du röstar avgör du själv.
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
    const boostedTitles = [...boosts];
    // Tolkningen blir inaktuell så fort svar eller kommentarer ändras efter att den skapades.
    const analysisStale =
      ai.analysis !== null && isAnalysisStale(ai.fingerprint, runFingerprint(answerTuples(), comments, comment));
    const excludedSummary = excludedCommentSummary(ai.excluded, qText);
    const canAnalyze = consent && commentItems().length > 0 && !ai.loading;

    return (
      <main className="container">
        <ProgressHeader headingRef={headingRef} title="Resultat" answeredCount={answeredCount} total={total} commentCount={commentCount} />
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn" onClick={() => setStep(Math.max(0, sections.length - 1))}>← Ändra svar</button>
          <span className="result-actions">
            <button type="button" className="btn" onClick={() => resetRun()}>Gör om samma test</button>
            <button type="button" className="btn" onClick={() => resetRun(crypto.randomUUID())}>Ny variant</button>
            <button type="button" className="btn btn-primary" onClick={share}>{shared === "shared" ? "Delat ✓" : shared === "clipboard" ? "Kopierat ✓" : "Dela resultat"}</button>
          </span>
        </div>
        <p className="permnote">
          Adressfältet innehåller nu en länk till exakt detta resultat. Spara eller dela den – svaren ligger kodade i
          själva länken (efter #) och skickas aldrig till servern.
        </p>

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
                {boostedTitles.length > 0 && <> Uppviktade områden (×1,5): {boostedTitles.join(" · ")}.</>}
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
                const partyObj = partyById.get(m.partyId);
                const dims = open && partyObj
                  ? matchPartyByDimension(partyObj, questions, canonical, scale, method).filter((d) => d.percent !== null)
                  : [];
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
                        {dims.length > 1 && (
                          <div className="dimline" aria-label={`Matchning per dimension mot ${m.partyName}`}>
                            {dims.map((d) => (
                              <span key={d.dimension}>
                                {DIMLABEL[d.dimension]}: <strong>{d.percent} %</strong> ({d.answeredCount} {d.answeredCount === 1 ? "fråga" : "frågor"})
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="meta">Baserat på {m.answeredCount} frågor. Sorterat efter störst överensstämmelse.</p>
                        {bd.map((b) => {
                          const ag = agree(b.agreement);
                          const src = sources[`${m.partyId}::${b.questionId}`];
                          const commented = Boolean(comments[b.questionId]?.trim());
                          const nuanced = nuancedIds.has(b.questionId);
                          return (
                            <div className="bdrow" key={b.questionId}>
                              <span className={`agchip ${ag.c}`}>{ag.t}</span>
                              <span className="bdq">{qText[b.questionId]}</span>
                              {nuanced ? (
                                <span className="qcbadge" title="AI-tolkningen vägde in din kommentar på den här frågan">💬 i din tolkning</span>
                              ) : commented ? (
                                <span className="qcbadge" title="Du har kommenterat den här frågan">💬 kommenterad</span>
                              ) : null}
                              {src && <a className="srclink" href={src.url} target="_blank" rel="noopener noreferrer" title={src.label}>källa ↗</a>}
                              <span className="bdmeta">
                                Du: {stanceFor(b.questionId, b.userValue)} · {m.partyId}: {stanceFor(b.questionId, b.partyValue)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="meta" style={{ marginTop: 14 }}>Metod: {method}. Klicka på ett parti för att se var ni är överens och skiljer er åt, med källa och partiets hållning i ord.</p>
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
              <p className="meta" style={{ textAlign: "center" }}>
                Partiernas placering beräknas på hela frågebanken och ligger därför still mellan testvarianter. Din punkt följer dina svar i den aktuella körningen.
              </p>
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
              <h2 id="kommentar-rubrik">Din profil i ord</h2>
              <p className="meta">
                Reglagen ger siffran och dina egna ord ger nyansen. Skriv varför du svarade som du gjorde, så tolkar
                AI:n din profil i ord och visar hur varje kommentar vägdes in. Tolkningen är ett separat, tydligt märkt
                lager; matchningsprocenten räknas alltid enbart på dina skalsvar.
              </p>
              {suggested.length > 0 && !ai.analysis && !ai.loading && (
                <div className="suggest">
                  <strong>Nyansera där det väger tyngst</strong>
                  <p className="meta" style={{ margin: "2px 0 0" }}>
                    Det här är dina starkaste ställningstaganden i testet. En mening om <em>varför</em> räcker för att göra tolkningen skarpare.
                  </p>
                  <ul>
                    {suggested.map((q) => {
                      const open = commentOpen[q.id] || (comments[q.id]?.trim().length ?? 0) > 0;
                      const a = answers[q.id];
                      const answerLabel = a?.value != null ? SCALE_OPTS.find((o) => o.v === a.value)?.label : null;
                      return (
                        <li key={q.id}>
                          <span className="bdq">{q.text}</span>
                          <span className="meta">
                            Du svarade {answerLabel?.toLowerCase() ?? "–"}{a?.weight === 2 ? " och markerade frågan som ★ viktig" : ""}.
                          </span>{" "}
                          {open ? (
                            <>
                              <textarea
                                className="qcommentbox"
                                aria-label={`Kommentar till: ${q.text}`}
                                placeholder="Varför? Vad avgjorde ditt svar?"
                                rows={2}
                                maxLength={MAX_COMMENT_LENGTH}
                                value={comments[q.id] ?? ""}
                                onChange={(e) => setComments((s) => ({ ...s, [q.id]: e.target.value }))}
                              />
                              <CharCount length={(comments[q.id] ?? "").length} />
                            </>
                          ) : (
                            <button type="button" className="linkbtn" onClick={() => setCommentOpen((s) => ({ ...s, [q.id]: true }))}>
                              + Utveckla ditt svar
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {Object.entries(comments).filter(([, t]) => t !== "").length > 0 && (
                <div className="qcomments-summary">
                  <p className="meta">
                    Dina frågekommentarer (vägs in i tolkningen). Redigera direkt i rutan; töm rutan för att ta
                    bort kommentaren.
                  </p>
                  <ul>
                    {Object.entries(comments).filter(([, t]) => t !== "").map(([id, t]) => (
                      <li key={id}>
                        <strong>{qText[id] ?? id}</strong>
                        <textarea
                          className="qcommentbox"
                          aria-label={`Kommentar till: ${qText[id] ?? id}`}
                          rows={2}
                          maxLength={MAX_COMMENT_LENGTH}
                          value={t}
                          onChange={(e) => setComments((s) => ({ ...s, [id]: e.target.value }))}
                        />
                        <CharCount length={t.length} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea className="commentbox" aria-labelledby="kommentar-rubrik" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Övergripande kommentar (valfritt) – vad är viktigast för dig, och varför?" rows={4} maxLength={MAX_COMMENT_LENGTH} />
              <CharCount length={comment.length} />
              <label className="consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Jag samtycker till att mina kommentarer och svar i denna analys – som kan avslöja politiska åsikter –
                  behandlas och lagras till efter valdagen (13 september 2026) och då raderas. Texten skickas till och
                  tolkas av AI-leverantören Anthropic, vilket kan innebära överföring till USA. Frivilligt; kan
                  återkallas. Läs mer i vår <a href="/integritet">integritetspolicy</a>. (GDPR art. 9)
                </span>
              </label>
              <button type="button" className="btn btn-primary" onClick={submitComment} aria-busy={ai.loading} disabled={!canAnalyze}>
                {ai.loading ? "Tolkar…" : ai.analysis ? "Tolka om" : "Skapa min tolkning"}
              </button>
              {commentItems().length === 0 && (
                <p className="meta" style={{ marginTop: 6 }}>Skriv minst en kommentar (på en fråga ovan eller övergripande) så kan tolkningen skapas.</p>
              )}
              {commentItems().length > 0 && !consent && (
                <p className="meta" style={{ marginTop: 6 }}>
                  Bara samtycket saknas – kryssa i rutan ovan så kan tolkningen skapas. Kommentarer kan avslöja
                  politiska åsikter och behandlas därför först efter uttryckligt samtycke.
                </p>
              )}
              {ai.loading && (
                <div className="aiwait">
                  <span className="spinner" aria-hidden="true" />
                  <span>Tolkningen tar ofta upp till en minut. Matchningen ovan är redan klar och påverkas inte.</span>
                </div>
              )}
              {/* Diskret, artig live-region som annonserar AI-status för skärmläsare. */}
              <p className="sr-only" role="status" aria-live="polite">
                {ai.loading ? "Tolkar…" : ai.error ? "Tolkningen misslyckades" : ai.analysis ? "Tolkning klar" : ""}
              </p>
              {ai.error && (
                <div className="note notesplit" role="alert">
                  <span>{ai.error}</span>
                  <button type="button" className="btn" onClick={retryAnalysis} disabled={ai.loading}>Försök igen</button>
                </div>
              )}
              {/* Servern lägger uteslutna kommentarer i analysisNote; när analysen visas
                  renderas i stället den strukturerade varianten nedan (ingen dubblering). */}
              {ai.note && !(ai.analysis && ai.excluded.length > 0) && <p className="meta">{ai.note}</p>}
              {excludedSummary && (
                <div className="note" role="status">{excludedSummary}</div>
              )}
              {ai.analysis && analysisStale && (
                <div className="note notesplit">
                  <span>Tolkningen gäller en tidigare version av dina svar.</span>
                  <button type="button" className="btn" onClick={submitComment} disabled={!canAnalyze}>Tolka om</button>
                </div>
              )}
              {ai.analysis && (
                <div className={`analysis${analysisStale ? " stale" : ""}`}>
                  <span className="aibadge">AI-genererad tolkning – siffran räknas separat</span>
                  <p>{ai.analysis.summary}</p>
                  {ai.analysis.themes.length > 0 && (
                    <p className="chips">{ai.analysis.themes.map((t) => <span className="chip" key={t}>{t}</span>)}</p>
                  )}
                  {sentimentLabel(ai.analysis.sentiment) && (
                    <p className="meta">Ton i kommentarerna: {sentimentLabel(ai.analysis.sentiment)}</p>
                  )}
                  <div className="influencebox">
                    <h3>Så bidrog dina kommentarer</h3>
                    <p className="meta">Matchningsprocenten och partiernas rangordning räknas enbart på dina skalsvar. Kommentarerna formade den AI-genererade tolkningen, och frågorna de kopplades till är märkta med 💬 i partilistan ovan.</p>
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
                  på sidan <a href={`/radera#ref=${sessionId}`}>Radera dina uppgifter</a>.
                </p>
              </div>
            </div>
          </>
        )}

        <p className="disclaimer">
          Ett vägledande verktyg – hur du röstar avgör du själv. Matchningen är deterministisk
          och förklarbar; fritextkommentaren tolkas av AI som ett separat, märkt lager.
        </p>
      </main>
    );
  }

  // ---------- frågesteg ----------
  const section = sections[step]!;
  const sectionQs = section.questions;
  const boosted = boosts.has(section.title);
  return (
    <main className="container">
      <ProgressHeader
        headingRef={headingRef}
        title={`Avsnitt ${step + 1} av ${sections.length} · ${section.title}`}
        answeredCount={answeredCount}
        total={total}
        commentCount={commentCount}
      />
      <h2 className="sectiontitle">
        {section.title}
        {boosted && <span className="boostchip" title="Du valde att vikta upp det här området">★ väger tyngre (×1,5)</span>}
      </h2>

      {sectionQs.map((q) => {
        const showBox = commentOpen[q.id] || (comments[q.id]?.trim().length ?? 0) > 0;
        const a = answers[q.id];
        const strongAnswer = !!a && a.value !== null && (Math.abs(a.value) === 2 || a.weight === 2);
        const rationale = qMeta.get(q.id)?.rationale;
        return (
          <div className="question" key={q.id}>
            <div className="topic">{q.topic}</div>
            <div className="text">{q.text}</div>
            {rationale && (
              <>
                <button
                  type="button"
                  className="linkbtn"
                  aria-expanded={Boolean(whyOpen[q.id])}
                  onClick={() => setWhyOpen((s) => ({ ...s, [q.id]: !s[q.id] }))}
                >
                  Varför ställs frågan?
                </button>
                {whyOpen[q.id] && <p className="rationalebox">{rationale}</p>}
              </>
            )}
            <Scale
              id={q.id}
              answer={answers[q.id]}
              questionText={qText[q.id] ?? q.id}
              onSetValue={setVal}
              onToggleWeight={toggleWeight}
            />
            <div className="qcomment">
              {showBox ? (
                <>
                  <textarea
                    className="qcommentbox"
                    aria-label={`Kommentar till: ${q.text}`}
                    placeholder="Varför svarade du så? Ditt resonemang vägs in i AI-tolkningen av din profil (procenten räknas enbart på skalsvaren)."
                    rows={2}
                    maxLength={MAX_COMMENT_LENGTH}
                    value={comments[q.id] ?? ""}
                    onChange={(e) => setComments((s) => ({ ...s, [q.id]: e.target.value }))}
                  />
                  <CharCount length={(comments[q.id] ?? "").length} />
                </>
              ) : (
                <button type="button" className="linkbtn" onClick={() => setCommentOpen((s) => ({ ...s, [q.id]: true }))}>
                  + Utveckla ditt svar
                  {strongAnswer && <span className="nudge"> – starkt svar, berätta gärna varför</span>}
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
