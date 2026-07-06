"use client";

import { useMemo, useState } from "react";
import { LOW_DISCRIMINATION_THRESHOLD, discriminationByQuestion } from "@/src/catalog/catalog.ts";
import type { CatalogQuestion, PartyPosition } from "@/src/catalog/types.ts";

interface CatalogData {
  questions: CatalogQuestion[];
  positions: PartyPosition[];
}

// Samma skala som activeScale; admin-verktyget antar redan -2..2 i positionsvyn.
const SCALE = { min: -2, max: 2 };

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<CatalogData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyDrafts, setOnlyDrafts] = useState(true);

  async function authed(path: string, init?: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", "x-admin-token": token, ...(init?.headers ?? {}) },
    });
    return res;
  }

  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await authed("/api/admin/catalog");
      if (!res.ok) {
        setMsg(res.status === 401 ? "Fel admin-token." : "Kunde inte ladda.");
        setData(null);
        return;
      }
      setData((await res.json()) as CatalogData);
    } catch {
      setMsg("Nätverksfel.");
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, body?: unknown, label = "Klart.") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await authed(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      const json = (await res.json()) as { error?: string; validation?: unknown; ok?: boolean };
      if (!res.ok || json.error) {
        setMsg(json.error ?? "Något gick fel.");
      } else if (path.endsWith("/publish")) {
        const v = json as { ok: boolean; validation?: { errors: string[]; warnings: string[] }; version?: number };
        setMsg(
          v.ok
            ? `Publicerad (version ${v.version}). Varningar: ${v.validation?.warnings.length ?? 0}.`
            : `Kan inte publicera. Fel: ${v.validation?.errors.join("; ")}`,
        );
      } else {
        setMsg(label);
      }
      await load();
    } catch {
      setMsg("Nätverksfel.");
    } finally {
      setBusy(false);
    }
  }

  const draftQ = data?.questions.filter((q) => q.status === "draft").length ?? 0;
  const draftP = data?.positions.filter((p) => p.status === "draft").length ?? 0;
  const shownQuestions = (data?.questions ?? []).filter((q) => !onlyDrafts || q.status === "draft");
  const shownPositions = (data?.positions ?? []).filter((p) => !onlyDrafts || p.status === "draft");

  // Diskrimineringsgrad per fråga: hur mycket partierna faktiskt skiljer sig.
  const discrimination = useMemo(() => {
    if (!data) return new Map<string, { degree: number | null; spread: number | null }>();
    return new Map(
      discriminationByQuestion(data.questions, data.positions, SCALE).map((d) => [
        d.questionId,
        { degree: d.degree, spread: d.spread },
      ]),
    );
  }, [data]);
  const lowDiscriminationCount = [...discrimination.values()].filter(
    (d) => d.degree !== null && d.degree < LOW_DISCRIMINATION_THRESHOLD,
  ).length;

  return (
    <main className="container">
      <h1>Admin – granskning</h1>
      <p className="muted">Granska och godkänn AI-föreslagna frågor och partipositioner innan publicering.</p>

      <div className="toolbar">
        <input
          className="admintoken"
          type="password"
          placeholder="Admin-token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={load} disabled={busy || !token}>
          Ladda
        </button>
        {data && (
          <>
            <button className="btn" type="button" onClick={() => act("/api/admin/seed?set=2026", undefined, "2026-utkast inlagda.")} disabled={busy}>
              Seed 2026-utkast
            </button>
            <button className="btn" type="button" onClick={() => act("/api/admin/seed", undefined, "Demo-utkast inlagda.")} disabled={busy}>
              Seed demo-utkast
            </button>
            <button className="btn" type="button" onClick={() => act("/api/admin/approve", { kind: "all" }, "Alla utkast godkända.")} disabled={busy}>
              Godkänn alla utkast
            </button>
            <button className="btn" type="button" onClick={() => act("/api/admin/publish", { version: 1 })} disabled={busy}>
              Validera &amp; publicera
            </button>
            <label className="muted" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <input type="checkbox" checked={onlyDrafts} onChange={(e) => setOnlyDrafts(e.target.checked)} />
              Visa endast utkast
            </label>
          </>
        )}
      </div>

      {msg && <p className="close">{msg}</p>}

      {data && (
        <>
          <p className="meta">
            {data.questions.length} frågor ({draftQ} utkast) · {data.positions.length} positioner ({draftP} utkast)
            {lowDiscriminationCount > 0 && (
              <> · <strong>{lowDiscriminationCount} frågor med låg diskrimineringsgrad (&lt; {LOW_DISCRIMINATION_THRESHOLD})</strong></>
            )}
          </p>

          <h2>Frågor{onlyDrafts ? " (endast utkast)" : ""}</h2>
          {data.questions.length === 0 && <p className="muted">Inga frågor. Klicka &quot;Seed demo-utkast&quot;.</p>}
          {data.questions.length > 0 && shownQuestions.length === 0 && <p className="muted">Inga utkast kvar – alla frågor godkända.</p>}
          {shownQuestions.map((q) => {
            const d = discrimination.get(q.id);
            const lowD = d?.degree != null && d.degree < LOW_DISCRIMINATION_THRESHOLD;
            return (
            <div className="question" key={q.id}>
              <div className="topic">
                {q.id} · {q.topic} · {q.dimension ?? "ingen axel"} · pol {q.polarity}{" "}
                {d?.degree != null && (
                  <span className={`statuschip ${lowD ? "draft" : "approved"}`} title={`Spridning över partierna: grad ${d.degree}, max–min ${d.spread}`}>
                    diskr. {d.degree}{lowD ? " ⚠ låg" : ""}
                  </span>
                )}{" "}
                <span className={`statuschip ${q.status}`}>{q.status}</span>
              </div>
              <div className="text">{q.text}</div>
              {q.rationale && <p className="meta">Motivering: {q.rationale}</p>}
              {q.status === "draft" && (
                <button className="btn btn-primary" type="button" onClick={() => act("/api/admin/approve", { kind: "question", questionId: q.id })} disabled={busy}>
                  Godkänn fråga
                </button>
              )}
            </div>
            );
          })}

          <h2>Partipositioner{onlyDrafts ? " (endast utkast)" : ""}</h2>
          {data.positions.length > 0 && shownPositions.length === 0 && <p className="muted">Inga utkast kvar – alla positioner godkända.</p>}
          {shownPositions.map((p) => (
            <div className="question" key={`${p.questionId}::${p.partyId}`}>
              <div className="topic">
                {p.questionId} · {p.partyId} · värde {p.value} · {p.citations.length} citat{" "}
                <span className={`statuschip ${p.status}`}>{p.status}</span>
              </div>
              {p.citations[0] && <p className="meta">Belägg: {p.citations[0].label}</p>}
              {p.status === "draft" && (
                <button className="btn btn-primary" type="button" onClick={() => act("/api/admin/approve", { kind: "position", questionId: p.questionId, partyId: p.partyId })} disabled={busy}>
                  Godkänn position
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
