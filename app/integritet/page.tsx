import Link from "next/link";

export const metadata = {
  title: "Integritetspolicy – Valkompass 2026",
  description: "Hur personuppgifter och fritextkommentarer hanteras enligt GDPR.",
};

export default function IntegritetPage() {
  return (
    <main className="container prose">
      <p>
        <Link href="/">← Tillbaka</Link>
      </p>
      <h1>Integritetspolicy</h1>

      <div className="note">
        Utkast – fyll i personuppgiftsansvarig och kontaktuppgifter, och låt en jurist granska innan
        publik lansering.
      </div>

      <h2>Personuppgiftsansvarig</h2>
      <p>[Organisation/namn], [org.nr], [kontakt-e-post]. Personuppgiftsansvarig för behandlingen.</p>

      <h2>Vilka uppgifter och varför</h2>
      <ul>
        <li>
          <strong>Dina skalsvar och din matchning</strong> sparas utan direkt identifierare (inget namn,
          e-post eller IP) för att kunna visa och, i aggregerad form, förbättra tjänsten.
        </li>
        <li>
          <strong>Fritextkommentarer</strong> kan avslöja politiska åsikter och behandlas därför som
          känsliga personuppgifter (GDPR art. 9). De behandlas och lagras endast om du lämnar uttryckligt
          samtycke.
        </li>
      </ul>

      <h2>Rättslig grund</h2>
      <p>
        Uttryckligt samtycke (art. 9.2 a och art. 6.1 a) för fritextkommentarer. Samtycket är frivilligt
        och kan återkallas när som helst – då upphör behandlingen och kommentaren raderas.
      </p>

      <h2>Mottagare och överföring</h2>
      <p>
        Fritextkommentaren skickas pseudonymiserad (utan identifierare) till vår AI-leverantör Anthropic
        för analys. Detta kan innebära överföring till USA, som hanteras med personuppgiftsbiträdesavtal
        och tillämpliga skyddsåtgärder (t.ex. EU-U.S. Data Privacy Framework / standardavtalsklausuler).
        Vi efterfrågar att leverantören inte lagrar innehållet (Zero Data Retention).
      </p>

      <h2>Lagringstid</h2>
      <p>
        Fritextkommentarer raderas automatiskt efter valdagen den 13 september 2026. Du kan begära
        radering tidigare.
      </p>

      <h2>AI-transparens</h2>
      <p>
        Vi använder AI för att tolka fritextkommentarer. AI-genererad text märks tydligt som
        AI-genererad. AI:n ger inga röstningsrekommendationer och påverkar inte matchningssiffran.
      </p>

      <h2>Dina rättigheter</h2>
      <p>
        Du har rätt till tillgång, rättelse, radering, begränsning, dataportabilitet och att återkalla
        samtycke, samt att klaga till Integritetsskyddsmyndigheten (IMY).
      </p>

      <h2>Cookies</h2>
      <p>
        Vi använder endast nödvändiga cookies och inga spårningsverktyg. Ditt cookie-val kan ändras genom
        att rensa webbplatsdata i webbläsaren.
      </p>
    </main>
  );
}
