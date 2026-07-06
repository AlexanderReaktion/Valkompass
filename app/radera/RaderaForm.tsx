"use client";

import { type FormEvent, useEffect, useState } from "react";

import { ANALYSIS_STORE_KEY, SESSION_STORAGE_KEY, parseStoredAnalysis } from "@/src/kompass/analysisStorage.ts";

// Samma format som serverns validering i /api/session/delete.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; deleted: number; clearedLocal: boolean }
  | { kind: "error"; message: string };

/**
 * Rensa lokala kopior som hör till den raderade sessionen: den sparade
 * AI-tolkningen (inkl. kommentarer) och sessionsreferensen själv. Historiken
 * (kompass-history-v1) rör vi inte – den är svarslokal och saknar sessionskoppling.
 */
function clearLocalCopies(sessionId: string): boolean {
  let cleared = false;
  try {
    const stored = parseStoredAnalysis(localStorage.getItem(ANALYSIS_STORE_KEY));
    if (stored?.sessionId === sessionId) {
      localStorage.removeItem(ANALYSIS_STORE_KEY);
      cleared = true;
    }
    if (localStorage.getItem(SESSION_STORAGE_KEY) === sessionId) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      cleared = true;
    }
  } catch {
    /* t.ex. privat läge utan lagring — inget att rensa */
  }
  return cleared;
}

export default function RaderaForm() {
  const [ref, setRef] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Förifyll från fragmentet (#ref=...) när man kommer via kvittolänken.
  // Fragmentet skickas aldrig till servern, så referensen hamnar inte i loggar.
  useEffect(() => {
    try {
      const m = window.location.hash.match(/^#ref=([0-9a-fA-F-]{36})$/);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- avsiktlig engångsförifyllning från fragmentet
      if (m && UUID_RE.test(m[1]!)) setRef(m[1]!);
    } catch {
      /* utan fragment fylls fältet i manuellt */
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sessionId = ref.trim();
    if (!UUID_RE.test(sessionId)) {
      setStatus({ kind: "error", message: "Referensen ser inte ut som en giltig session-referens. Den har formen 8-4-4-4-12 hexadecimala tecken, t.ex. 123e4567-e89b-42d3-a456-426614174000." });
      return;
    }
    setStatus({ kind: "working" });
    try {
      const res = await fetch("/api/session/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? "Något gick fel. Försök igen." });
        return;
      }
      setStatus({ kind: "done", deleted: data.deleted ?? 0, clearedLocal: clearLocalCopies(sessionId) });
    } catch {
      setStatus({ kind: "error", message: "Nätverksfel. Kontrollera anslutningen och försök igen." });
    }
  }

  return (
    <>
      <form className="deleteform" onSubmit={submit}>
        <label htmlFor="radera-ref">Session-referens</label>
        <input
          id="radera-ref"
          className="refinput"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="t.ex. 123e4567-e89b-42d3-a456-426614174000"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={status.kind === "working"}>
          {status.kind === "working" ? "Raderar…" : "Radera mina uppgifter"}
        </button>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {status.kind === "working" ? "Raderar…" : status.kind === "done" ? "Radering klar" : ""}
      </p>
      {status.kind === "done" && (
        <div className="stability stable" role="status">
          <strong>Klart.</strong>
          <span>
            {status.deleted === 0
              ? "Inga sparade poster hittades för referensen. Antingen fanns inget sparat, eller så är uppgifterna redan raderade."
              : `${status.deleted} ${status.deleted === 1 ? "sparad post" : "sparade poster"} raderades från servern.`}
            {status.clearedLocal ? " Lokala kopior i den här webbläsaren rensades också." : ""}
          </span>
        </div>
      )}
      {status.kind === "error" && (
        <div className="note" role="alert">{status.message}</div>
      )}
    </>
  );
}
