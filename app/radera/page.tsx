import Link from "next/link";

import RaderaForm from "./RaderaForm.tsx";

export const metadata = {
  title: "Radera dina uppgifter – Valkompass 2026",
  description: "Begär radering av sparade svar, kommentarer och AI-analyser via din session-referens (GDPR art. 17).",
};

export default function RaderaPage() {
  return (
    <main className="container prose">
      <p>
        <Link href="/">← Tillbaka</Link>
      </p>
      <h1>Radera dina uppgifter</h1>
      <p>
        Här raderar du allt som sparats på servern för din session: resultat, kommentarer, AI-analyser
        och samtyckeslogg (GDPR art. 17). Ange den session-referens som visades tillsammans med ditt
        resultat. Raderingen sker direkt och kan inte ångras.
      </p>
      <RaderaForm />
      <p>
        Utan referensen kan vi inte koppla uppgifterna till dig, eftersom vi medvetet inte lagrar några
        andra identifierare. Oavsett radering gallras alla sparade uppgifter automatiskt efter valdagen
        den 13 september 2026. Läs mer i vår <Link href="/integritet">integritetspolicy</Link>.
      </p>
    </main>
  );
}
