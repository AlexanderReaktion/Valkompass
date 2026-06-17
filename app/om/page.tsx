import Link from "next/link";

export const metadata = {
  title: "Om & metod – Valkompass 2026",
  description: "Hur valkompassen fungerar: metod, dimensioner, neutralitet och AI-användning.",
};

export default function OmPage() {
  return (
    <main className="container prose">
      <p>
        <Link href="/">← Tillbaka</Link>
      </p>
      <h1>Om & metod</h1>

      <h2>Vad kompassen gör</h2>
      <p>
        Du svarar på sakpåståenden på en skala. Din matchning mot partierna räknas av deterministisk
        kod – samma svar ger alltid samma siffra, och den går att förklara fråga för fråga. Det är inte
        en rekommendation att rösta på ett visst parti.
      </p>

      <h2>Tvådimensionell modell</h2>
      <p>
        Partier och väljare placeras på två axlar: ekonomisk vänster–höger och värderingsdimensionen
        GAL–TAN. En enda vänster–höger-skala räcker inte för att rättvist placera alla partier.
      </p>

      <h2>Transparent och utbytbar matchning</h2>
      <p>
        Forskning visar att valet av matchningsmetod i sig kan ändra partirådet. Därför visar vi metoden
        öppet och låter dig byta den och se hur resultatet förändras. &quot;Vet ej&quot; exkluderas
        parvis och tolkas aldrig som en mittposition.
      </p>

      <h2>Frågor och partipositioner</h2>
      <p>
        Frågorna formuleras neutralt och konkret för att dämpa partiledtråd (att man svarar som
        &quot;sitt&quot; parti i stället för efter sakfrågan). Partiernas positioner ska beläggas mot
        partiprogram och faktiska riksdagsvoteringar och granskas av människa innan publicering.
      </p>

      <h2>AI-användning</h2>
      <p>
        Om du skriver en fritextkommentar tolkas den av en AI-modell som ett separat, tydligt märkt
        lager – teman, ton och kopplingar. Detta lager ändrar aldrig matchningssiffran. AI:n
        rekommenderar aldrig ett parti.
      </p>

      <h2>Begränsningar</h2>
      <p>
        En valkompass fångar inte allt som avgör ett röstbeslut – partiledarförtroende, lojalitet eller
        förtroende för hur ett parti skött sitt uppdrag. Se resultatet som vägledning, inte facit.
      </p>
    </main>
  );
}
