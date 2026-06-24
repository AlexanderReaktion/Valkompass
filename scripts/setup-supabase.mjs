// Kör src/db/schema.sql mot Supabase. Hittar rätt pooler-region automatiskt.
// Användning: node scripts/setup-supabase.mjs <project-ref> <db-password>
// Lösenord skickas som argv (hamnar aldrig i koden/repot).

import pg from "pg";
import { readFileSync } from "node:fs";

const [, , ref, password] = process.argv;
if (!ref || !password) {
  console.error("usage: node scripts/setup-supabase.mjs <ref> <password>");
  process.exit(1);
}

const schema = readFileSync(new URL("../src/db/schema.sql", import.meta.url), "utf8");

const regions = ["eu-north-1", "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-2", "us-east-1", "us-east-2", "us-west-1"];
const candidates = [];
for (const prefix of ["aws-0", "aws-1"]) {
  for (const r of regions) {
    candidates.push({ label: `pooler ${prefix} ${r}`, cs: `postgresql://postgres.${ref}:${password}@${prefix}-${r}.pooler.supabase.com:5432/postgres` });
  }
}
candidates.push({ label: "direct", cs: `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres` });

const { Client } = pg;

// Samma TLS-villkor som appen: med DATABASE_CA_CERT verifieras servern (verify-full),
// annars krypterad men overifierad anslutning + en varning.
const caCert = process.env.DATABASE_CA_CERT;
const ssl = caCert ? { ca: caCert, rejectUnauthorized: true } : { rejectUnauthorized: false };
if (!caCert) {
  console.warn("DATABASE_CA_CERT saknas — TLS-certvalidering är AVSTÄNGD. Sätt DATABASE_CA_CERT för verify-full.");
}

let working = null;
for (const c of candidates) {
  const client = new Client({ connectionString: c.cs, ssl, connectionTimeoutMillis: 7000 });
  try {
    await client.connect();
    await client.query("select 1");
    console.log("CONNECTED via", c.label);
    await client.query(schema);
    const r = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
    console.log("SCHEMA APPLIED — public tables:", r.rows[0].n);
    await client.end();
    working = c;
    break;
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).slice(0, 90);
    console.log("  fail:", c.label, "-", msg);
    try { await client.end(); } catch {}
  }
}

if (!working) {
  console.error("NO WORKING CONNECTION");
  process.exit(1);
}
console.log("WORKING_DATABASE_URL=" + working.cs);
