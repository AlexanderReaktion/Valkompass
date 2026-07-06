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
        kod – samma svar ger alltid samma siffra, och den går att förklara fråga för fråga. Resultatet
        är en vägledning; hur du röstar avgör du själv.
      </p>

      <h2>Tvådimensionell modell</h2>
      <p>
        Partier och väljare placeras på två axlar: ekonomisk vänster–höger och värderingsdimensionen
        GAL–TAN. Det krävs två axlar för att placera dagens partier rättvist; på en enda
        vänster–höger-skala hamnar flera partier fel.
      </p>

      <h2>Transparent och utbytbar matchning</h2>
      <p>
        Forskning visar att valet av matchningsmetod i sig kan ändra partirådet. Därför visar vi metoden
        öppet och låter dig byta den och se hur resultatet förändras. &quot;Vet ej&quot; exkluderas
        parvis och tolkas aldrig som en mittposition.
      </p>
      <p>
        <strong>Så räknas siffran (standardmetoden Hybrid):</strong> för varje besvarad fråga jämförs ditt
        svar med partiets position på samma femgradiga skala. Två likhetsmått beräknas: dels{" "}
        <em>city-block</em> (1 minus det genomsnittliga avståndet, normerat med skalans bredd), dels{" "}
        <em>riktning</em> (samma avståndsmått, med ett extra avdrag när du och partiet står på var sin
        sida om mitten; oenighet tvärs över mitten väger tyngre än gradskillnad på samma sida).
        Hybridsiffran är medelvärdet av de två, visad som procent. Frågor du stjärnmarkerat väger dubbelt,
        och områden du viktat upp på startsidan räknas ×1,5. Riktningsmåttet är en egen, öppen konstruktion
        som valdes framför den klassiska &quot;scalar product&quot;-modellen: med vår variant kan även en
        mittenväljare få 100 % mot ett mittenparti.
      </p>

      <h2>Frågor och partipositioner</h2>
      <p>
        Frågorna formuleras neutralt och konkret för att dämpa partiledtråd (att man svarar som
        &quot;sitt&quot; parti i stället för efter sakfrågan). Vartannat påstående pekar dessutom åt
        &quot;vänster&quot; och vartannat åt &quot;höger&quot; för att dämpa ja-sägartendens. Partiernas
        positioner ska beläggas mot partiprogram och faktiska riksdagsvoteringar och granskas av människa
        innan publicering. Varje fråga har en synlig motivering (&quot;Varför ställs frågan?&quot;) och en
        beräknad <em>diskrimineringsgrad</em> (ett mått på hur mycket partierna faktiskt skiljer sig åt på
        frågan) som granskarna använder för att sålla bort frågor som mest tillför brus.
        Testet använder ett balanserat urval ur en större frågebank. Flera formuleringar kan höra till
        samma sakfrågegrupp, men bara en av dem tas med i en körning. Därför kan du göra en ny variant
        och jämföra om resultatet ligger kvar ungefär på samma plats. På kartan beräknas partiernas
        placering alltid på hela frågebanken, så att de ligger still mellan varianter.
      </p>

      <h2>AI-användning</h2>
      <p>
        Om du skriver fritextkommentarer tolkas de av en AI-modell som ett separat, tydligt märkt
        lager – din profil i ord, med teman, ton och kopplingar. Matchningssiffran räknas alltid enbart
        på dina skalsvar, och AI:n rekommenderar aldrig ett parti. Resultatet visar också hur varje
        kommentar vägdes in: om den förstärkte ett skalsvar, nyanserade det eller visade en spänning.
        Frågorna som berördes märks upp i partilistan.
      </p>

      <h2>Dela och gör om</h2>
      <p>
        Resultatlänken innehåller dina svar kodade i själva länken (delen efter #). Den delen skickas
        aldrig till servern. Den som får länken återskapar resultatet lokalt i sin webbläsare, och
        inget lagras hos oss när du delar. Din körningshistorik (för jämförelsen mellan varianter) sparas
        bara i din egen webbläsare.
      </p>

      <h2>Begränsningar</h2>
      <p>
        En valkompass fångar bara en del av det som avgör ett röstbeslut. Partiledarförtroende,
        lojalitet och synen på hur ett parti skött sitt uppdrag ligger utanför modellen. Läs resultatet
        som en vägledning bland flera inför ditt eget beslut.
      </p>
    </main>
  );
}
