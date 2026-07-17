/**
 * Synkar arbets-katalogen till repo-innehållet (nya publika motiveringar) och
 * publicerar en ny version, med användarens kurering bevarad:
 *   seed (allt -> draft, nya texter) -> godkänn EXAKT de tidigare godkända
 *   frågorna individuellt -> godkänn alla positioner -> publicera nästa version.
 *
 * Kureringen (frågor som medvetet lämnats som draft) röras aldrig: bulk-approve
 * används inte alls för frågor.
 *
 * Körs:  node syncCatalog.mjs <BASE_URL> <VERSION>
 * Token: SYNC_ADMIN_TOKEN i miljön.
 * Kurering läses från /api/admin/catalog vid start (före ev. seed).
 */

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
const VERSION = Number(process.argv[3]);
const TOKEN = process.env.SYNC_ADMIN_TOKEN;
if (!BASE || !Number.isInteger(VERSION) || !TOKEN) {
  console.error("Användning: SYNC_ADMIN_TOKEN=... node syncCatalog.mjs <BASE_URL> <VERSION>");
  process.exit(1);
}

// Ögonblicksbild av kureringen tas FÖRE seed (seed nollställer statusar).
// Kör alltså alltid scriptet från ett intakt läge; det är omkörningsbart
// (avstämmande) om det avbryts efter seed.
const before = await call("/api/admin/catalog");
const approvedIds = before.questions.filter((q) => q.status === "approved").map((q) => q.id);
const draftIds = before.questions.filter((q) => q.status === "draft").map((q) => q.id);
const positionPairs = before.positions.map((p) => ({ questionId: p.questionId, partyId: p.partyId }));
console.log(`Plan: seed -> godkänn ${approvedIds.length} frågor + ${positionPairs.length} positioner -> publicera v${VERSION}. Lämnas som draft: ${draftIds.length} frågor.`);

async function call(path, init = {}, attempt = 1) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-admin-token": TOKEN, ...(init.headers ?? {}) },
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    // Transienta pool-/nätverksfel (t.ex. Supabase EMAXCONNSESSION): backa och försök igen.
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      return call(path, init, attempt + 1);
    }
    throw new Error(`${path} -> HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

// Strikt sekventiellt med andrum: serverless + session-pooler tål inte bursts
// (frysta instanser håller anslutningar utan att kunna idle-stänga dem).
async function pooled(items, worker, _concurrency = 1, label = "") {
  const errors = [];
  for (let i = 0; i < items.length; i += 1) {
    try {
      await worker(items[i]);
    } catch (e) {
      errors.push(`${label}[${i}]: ${e.message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  ${label}: ${i + 1}/${items.length}`);
    await new Promise((r) => setTimeout(r, 80));
  }
  if (errors.length > 0) throw new Error(`${errors.length} fel, första: ${errors[0]}`);
}

// 0. Läs NULÄGET och stäm av mot målet i stället för att spela om allt.
const NEW_RATIONALE_MARKER = "Den visar hur du ser på hårdare straff"; // straff-frågans nya publika text
const current = await call("/api/admin/catalog");
const currentStraff = current.questions.find((q) => q.id === "straff");
const textsSynced = (currentStraff?.rationale ?? "").startsWith(NEW_RATIONALE_MARKER);

// 1. Seed bara om texterna inte redan är synkade (seed nollställer status till draft).
if (!textsSynced) {
  const seeded = await call("/api/admin/seed?set=2026", { method: "POST" });
  console.log(`Seed klar: ${seeded.questions} frågor, ${seeded.positions} positioner (allt draft).`);
} else {
  console.log("Seed hoppas över: texterna är redan synkade (straff har nya motiveringen).");
}

// 2+3. Godkänn det som SAKNAS: exakt kureringens frågor + alla positioner.
const state = await call("/api/admin/catalog");
const approvedNow = new Set(state.questions.filter((q) => q.status === "approved").map((q) => q.id));
const draftPosNow = new Set(state.positions.filter((p) => p.status === "draft").map((p) => `${p.questionId}::${p.partyId}`));
const qMissing = approvedIds.filter((id) => !approvedNow.has(id));
const pMissing = positionPairs.filter((p) => draftPosNow.has(`${p.questionId}::${p.partyId}`));
console.log(`Att godkänna: ${qMissing.length} frågor, ${pMissing.length} positioner (resten redan klara).`);

await pooled(qMissing, (id) => call("/api/admin/approve", { method: "POST", body: JSON.stringify({ kind: "question", questionId: id }) }), 2, "frågor");
await pooled(pMissing, (p) => call("/api/admin/approve", { method: "POST", body: JSON.stringify({ kind: "position", questionId: p.questionId, partyId: p.partyId }) }), 2, "positioner");
console.log("Godkännanden klara.");

// 4. Publicera nästa version (validering körs server-side; fel avbryter utan att röra serveringen).
const pub = await call("/api/admin/publish", { method: "POST", body: JSON.stringify({ version: VERSION }) });
console.log(`Publicerad: version ${pub.version}, valideringsfel ${pub.validation.errors.length}, varningar ${pub.validation.warnings.length}.`);

// 5. Efterkontroll: kureringen intakt + ny motivering på plats.
const after = await call("/api/admin/catalog");
const apprAfter = after.questions.filter((q) => q.status === "approved").map((q) => q.id).sort();
const draftAfter = after.questions.filter((q) => q.status === "draft").map((q) => q.id).sort();
const sameApproved = JSON.stringify(apprAfter) === JSON.stringify([...approvedIds].sort());
const sameDraft = JSON.stringify(draftAfter) === JSON.stringify([...draftIds].sort());
const straff = after.questions.find((q) => q.id === "straff");
console.log(`Efterkontroll: godkända ${apprAfter.length} (identiska med före: ${sameApproved}) · draft ${draftAfter.length} (identiska: ${sameDraft})`);
console.log(`Ny motivering (straff): ${(straff?.rationale ?? "").slice(0, 90)}`);
if (!sameApproved || !sameDraft) {
  console.error("AVVIKELSE i kureringen – granska innan något mer görs!");
  process.exit(2);
}
console.log("Synk klar.");
