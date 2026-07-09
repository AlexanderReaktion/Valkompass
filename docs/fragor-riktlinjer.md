# Frågeriktlinjer — neutral formulering & dämpad partiledtråd

Syftar till att minska **partiledtråd (party cue)** och **ja-sägartendens (acquiescence)**: att respondenten svarar som hen vet att "sitt" parti tycker, i stället för efter sakinnehållet. Reglerna gäller både AI-genererade frågeförslag och den mänskliga granskningen (frågorna godkänns alltid av människa innan de serveras).

> **Bärande spänning:** neutralisera ledtråden — men **aldrig** på bekostnad av klarhet. Krångliga, dubbla eller invecklade formuleringar straffar just de mindre politiskt kunniga väljare verktyget ska hjälpa mest, och sänker validiteten. Mål: *neutralt och konkret*, inte *luddigt*.

## Reglerna

1. **Beskriv den konkreta åtgärden, inte sloganen.** Använd det faktiska, sakliga förslaget. Undvik partiernas signaturuttryck ("arbetslinjen", "vinster i välfärden", "krafttag mot …", "verkningsfull klimatpolitik", "ordning och reda") — de cue:ar partiet direkt.
2. **Rensa värdeladdade ord.** Ord som "rättvis", "trygg", "ansvarsfull", "modig", "krafttag", "äntligen", "dags att" signalerar en sida och drar igång ja-sägande. Formulera värderingsneutralt.
3. **Inga avsändarsignaler.** Nämn aldrig partier, politiker, eller proxyn som "regeringens politik", "Tidöavtalet", "den rödgröna oppositionen", "SD-förslaget". Blocketiketter är lika avslöjande som partinamn.
4. **Variera svarsriktningen.** Låt inte "instämmer" konsekvent peka åt samma håll genom hela batteriet. Blanda omvänt formulerade påståenden — bryter både partiledtråd och ja-sägartendens. (Tekniskt stöd: `polarity: -1` på frågan; intaget speglar svaret, motorn förblir kanonisk. Se `src/matching/intake.ts`.)
5. **Tvåsidig stam där det är rimligt.** Lägg in avvägningen så att ingen sida låter självklart dygdig: nämn både nyttan och kostnaden ("… även om det höjer priser för konsumenter", "… även om det ökar inkomstskillnaderna"). Då blir det svårare att svara reflexmässigt "vem kan vara emot".
6. **Konkret framför abstrakt.** Specifika, aktuella förslag (gärna med storlek/villkor) tvingar fram ett ställningstagande till innehållet i stället för till laget.
7. **En sakfråga per påstående.** Inga dubbelfrågor ("X och Y") — de går inte att besvara entydigt och döljer var skiljelinjen går.
8. **Baslinjeaudit mot gällande rätt före varje publicering.** Varje stam ska beskriva det aktuella rättsläget korrekt. En stam får aldrig beskriva redan beslutad lag som ett förslag ("bör införas" om något redan är infört); formulera då i stället som behåll eller riv upp. Omankrade stammar (ny betydelse) kräver att partipositionerna re-verifieras källgrundat innan servering, eftersom de gamla positionsvärdena blir felaktiga för den nya frågan. Instabila frågor (bräcklig vapenvila, pågående rådsförhandling) får en publiceringsnot i katalogen och kontrolleras om 1–2 veckor före publicering. *Precedens: baslinjeauditen juli 2026 ankrade om 15 stammar mot gällande rätt (bland annat medborgarskap, visitationszoner, återvandringsbidraget, försvarsanslag 3,5 %) och satte en publiceringsnot på `israel_sanktioner`.*
9. **Motiveringen är publik användarcopy.** Texten bakom "Varför ställs frågan?" ska svara på varför frågan hjälper väljaren att placera sig: vilken sakpolitisk avvägning den fångar och varför den är relevant för matchningen. Den får inte innehålla interna granskningsord som `polarity`, "kanonisk riktning", "baslinje", "omankrad", propositionstekniska anteckningar eller kommentarer om alternativa formuleringar.
10. **Variant-id får aldrig vara ett bas-id.** Bas-id är det rena namnet (t.ex. `skatt_arbete`) och ska inte sluta på `_alt`. Alternativa formuleringar av samma sakfrågegrupp får suffixet `_alt` (t.ex. `skatt_arbete_alt`) och pekar via `positionSourceId` på basens positionsvärden. Grupperingen och de stabila partikoordinaterna på kartan bygger på att varianter känns igen på just det suffixet (`_alt`-ändelsen strippas för att härleda gruppen), så en basfråga med `_alt`-id skulle felaktigt buntas ihop med en annan grupp.

## Granskningssteg (admin-pipelinen)

- **Avsändartest:** bedöm varje förslag — "hur lätt avslöjas vilket parti som ligger bakom?" Flagga och skriv om de som är uppenbara av *formuleringen* (inte av sakinnehållet).
- **Signaturordslexikon:** kör frågetexten mot en lista över partiers signatur- och värdeord; träff = flagga för omskrivning.
- **Polaritetsbalans:** kontrollera att batteriet har en blandning av `polarity: 1` och `-1` och att "instämmer" inte korrelerar med ett block.
- **Baslinjeaudit:** stäm av varje stam mot gällande rätt/politik (regel 8) och verifiera att omankrade stammars positioner är omgjorda källgrundat innan de serveras.
- **Motiveringsgranskning:** läs varje "Varför ställs frågan?" som en väljare. Den ska vara begriplig utan intern kontext och inte beskriva frågeteknik, datamodell eller källgranskningsarbete.

## Ärlig takhöjd

På de hetaste skiljelinjerna (migration, vinster i välfärden, kärnkraft) cue:ar **själva sakfrågan** oundvikligen blocket — det går inte att dölja utan att göra frågan oklar, och det vore manipulativt. Vi tar bort den **undvikbara** ledtråden (slogans, värdeord, blocketiketter, ensidighet, konsekvent ja-riktning) — inte den inneboende ideologiska signalen i ett konkret förslag. Det är den ärliga och försvarbara nivån, och den ligger i linje med neutralitetskravet (AI Act art. 5).

## Illustrativa omskrivningar

Visar *teknik*, inte färdiga frågor. Poängen är att ta bort slogan/värdeord/ensidighet — inte att dölja åt vilket håll ett ja lutar.

| Cue:ande | Neutral & konkret |
|---|---|
| "Arbetslinjen ska stärkas genom sänkta bidrag." | "Ekonomiskt bistånd och a-kassa bör sänkas för att öka drivkrafterna att arbeta, även om inkomstskillnaderna ökar." |
| "Sverige ska ta ett ansvarsfullt klimatledarskap." | "Industrin bör få hårdare utsläppskrav, även om det höjer priser för konsumenter." |
| "Det är dags för krafttag mot gängkriminaliteten." | "Minimistraffen för grova vapenbrott bör höjas." |
