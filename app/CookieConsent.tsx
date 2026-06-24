"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * Cookie-samtycke enligt IMY/PTS-praxis: "Neka alla" lika lätt och framträdande
 * som "Acceptera alla", inga förkryssade rutor, inga dark patterns. Appen sätter
 * i nuläget bara nödvändiga cookies; valet loggas i localStorage.
 * (Art. 9-samtycket för fritextkommentarer är separat, i kompassen.)
 */

// localStorage läses som en extern store via useSyncExternalStore i stället för
// med en effekt som sätter state vid montering. Det undviker setState-i-effekt
// (kaskadrenders) men behåller beteendet: servern/första hydreringen visar inget
// (decided=true), sedan avslöjas raden om inget val finns lagrat.
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getDecidedSnapshot(): boolean {
  try {
    return Boolean(localStorage.getItem("cookie-consent"));
  } catch {
    return true;
  }
}
function getServerSnapshot(): boolean {
  return true;
}
function storeConsent(v: "all" | "necessary") {
  try {
    localStorage.setItem("cookie-consent", v);
    localStorage.setItem("cookie-consent-at", new Date().toISOString());
  } catch {
    /* ignore */
  }
  listeners.forEach((cb) => cb());
}

export default function CookieConsent() {
  const decided = useSyncExternalStore(subscribe, getDecidedSnapshot, getServerSnapshot);

  if (decided) return null;

  const choose = (v: "all" | "necessary") => storeConsent(v);

  return (
    <div className="cookiebar" role="dialog" aria-label="Cookie-samtycke">
      <p>
        Vi använder endast nödvändiga cookies och inga spårningsverktyg. Du kan neka övriga.{" "}
        <Link href="/integritet">Läs mer i integritetspolicyn</Link>.
      </p>
      <div className="cookiebtns">
        <button className="btn" type="button" onClick={() => choose("necessary")}>
          Neka alla
        </button>
        <button className="btn btn-primary" type="button" onClick={() => choose("all")}>
          Acceptera alla
        </button>
      </div>
    </div>
  );
}
