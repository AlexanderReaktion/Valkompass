"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Cookie-samtycke enligt IMY/PTS-praxis: "Neka alla" lika lätt och framträdande
 * som "Acceptera alla", inga förkryssade rutor, inga dark patterns. Appen sätter
 * i nuläget bara nödvändiga cookies; valet loggas i localStorage.
 * (Art. 9-samtycket för fritextkommentarer är separat, i kompassen.)
 */
export default function CookieConsent() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    try {
      setDecided(Boolean(localStorage.getItem("cookie-consent")));
    } catch {
      setDecided(true);
    }
  }, []);

  if (decided) return null;

  const choose = (v: "all" | "necessary") => {
    try {
      localStorage.setItem("cookie-consent", v);
      localStorage.setItem("cookie-consent-at", new Date().toISOString());
    } catch {
      /* ignore */
    }
    setDecided(true);
  };

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
