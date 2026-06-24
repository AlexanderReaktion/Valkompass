# Konsekvensbedömning avseende dataskydd (DPIA) — Valkompass 2026

> **Utkast för juristgranskning.** Fyll i personuppgiftsansvarig och datum, och låt
> dataskyddsombud/jurist granska och fastställa innan publik lansering. Underlag: GDPR art. 35,
> IMY:s förteckning över behandlingar som kräver DPIA, samt EU:s AI Act.

| Fält | Värde |
|---|---|
| Personuppgiftsansvarig | [Organisation, org.nr, kontakt] |
| Framtagen av / datum | [Namn] / [datum] |
| Version | 0.1 (utkast) |

## 1. Beskrivning av behandlingen

**Ändamål.** Tillhandahålla en valkompass som (a) deterministiskt matchar användarens sakpolitiska
svar mot partier och (b) med AI tolkar en frivillig fritextkommentar som ett kompletterande,
icke-avgörande lager, samt (c) i aggregerad/anonymiserad form analyserar vad väljare lyfter.

**Kategorier av uppgifter.**
- Skalsvar + beräknad matchning — utan direkt identifierare.
- Fritextkommentar — kan avslöja **politiska åsikter → känsliga personuppgifter (art. 9)**.
- Slumpmässigt session-UUID (pseudonym, ej IP/e-post), samtyckeslogg.

**Registrerade.** Besökare/väljare som frivilligt använder tjänsten.

**Mottagare / biträden.** Anthropic (AI-analys av pseudonymiserad fritext), hostingleverantör
(Vercel), databasleverantör (Postgres i EU), Upstash (Redis för rate limiting/budget-spärr,
EU-region). Personuppgiftsbiträdesavtal (DPA) krävs med samtliga.

**Tredjelandsöverföring.** Fritext skickas pseudonymiserad till Anthropic, vilket kan innebära
överföring till USA. Hanteras via DPF/standardavtalsklausuler + ZDR; överväg EU-residens (Bedrock
Frankfurt).

**Lagringstid.** Fritextkommentarer raderas automatiskt efter valdagen 13 september 2026
(`delete_after`-kolumn + gallringsjobb). Skalsvar/matchning lagras utan identifierare.

## 2. Nödvändighet och proportionalitet

- **Rättslig grund:** uttryckligt samtycke (art. 9.2 a + art. 6.1 a) för fritext. Berättigat
  intresse är **otillräckligt** för art. 9-data. Samtycket är separat, aktivt, dokumenterat och
  återkalleligt.
- **Dataminimering:** ingen identifierare kopplas till svaren; endast pseudonymiserad fritext skickas
  till AI; e-post lagras inte. IP-adress lagras inte beständigt — den används endast transient och i
  **hashad** form som nyckel för rate limiting (kort TTL, ~70 s, i Upstash) och kopplas aldrig till
  svar/fritext; inga onödiga loggar av prompttext.
- **Ändamålsbegränsning:** uppgifterna används bara för matchning, tolkning och aggregerad analys.

## 3. Riskbedömning

| Risk | Sannolikhet | Konsekvens | Hantering (se §4) |
|---|---|---|---|
| Röjande av politisk åsikt (art. 9) | Medel | Hög | Samtycke, pseudonymisering, kort retention, ZDR |
| Otillåten tredjelandsöverföring | Låg–Medel | Hög | DPF/SCC, DPA, ev. EU-residens, transfer impact assessment |
| Återidentifiering via fritext | Låg | Hög | Ingen identifierare lagras; uppmana att inte skriva identifierande uppgifter |
| Oavsiktlig loggning av känslig data | Låg | Hög | Logga aldrig kommentarstext; granska felrapportering/cache |
| AI-partiskhet / manipulativ påverkan | Låg | Hög | Neutralitet, deterministisk siffra, AI ger inga röstråd, transparens |
| Kvarliggande data efter valet | Låg | Medel | Automatisk gallring + verifierat gallringsjobb |

## 4. Åtgärder

Tekniska och organisatoriska skyddsåtgärder (implementerade i koden där inget annat anges):
- Identitet skild från innehåll; pseudonymt session-UUID.
- Uttryckligt, separat art. 9-samtycke innan fritext behandlas/lagras; samtyckeslogg.
- Automatisk radering efter valdagen; dataminimering; ingen beständig IP-lagring (endast transient,
  hashad IP med kort TTL för rate limiting).
- Endast pseudonymiserad text till Anthropic; eftersträva ZDR + DPA; spend limit.
- AI-genererad text märks tydligt; AI ger inga röstrekommendationer; matchningssiffran är
  deterministisk och förklarbar.
- Säkerhetsheaders, rate limiting, budget-spärr, input-tak.
- *Organisatoriskt (att fastställa):* DPA-er tecknade, åtkomstkontroll till admin, rutin för
  begäran om radering/återkallelse, incidentrutin.

## 5. AI Act-bedömning

Tjänsten visar output direkt för väljaren och profilerar (matchar) → **reell risk för
högriskklassning** (bilaga III p. 8(b)); art. 6(3)-undantaget är otillgängligt vid profilering.
Förbudet mot manipulativ AI (art. 5) gäller redan. Designval: positionera som
"informera/jämföra fakta", inte "påverka röstningsbeteende"; reproducerbar, förklarbar matchning;
AI-transparens (art. 50, full tillämpning 2026-08-02). **Att göra:** dokumentera klassningen
skriftligt; designa konservativt som om högriskkrav kan gälla.

## 6. Slutsats och kvarstående punkter

Med åtgärderna i §4 bedöms restrisken som hanterbar **förutsatt** att: (1) DPA + ZDR är på plats
hos Anthropic, (2) Postgres ligger i EU, (3) personuppgiftsansvarig och rutiner är fastställda,
(4) AI Act-klassningen dokumenteras, och (5) en jurist granskar denna DPIA och integritetspolicyn.
Förhandssamråd med IMY övervägs om restrisken bedöms hög efter åtgärder.
