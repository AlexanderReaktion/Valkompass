import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <div className="hero">
        <span className="tag">Riksdagsvalet 13 september 2026</span>
        <h1>Valkompass 2026</h1>
        <p>
          En mer genomgående valkompass: tvådimensionell (höger&ndash;vänster och GAL&ndash;TAN),
          med transparent och utbytbar matchningsmetod, neutralt formulerade frågor och
          fakta-ankrade partipositioner.
        </p>
      </div>

      <div className="note">
        Tidig prototyp. Frågor och partipositioner är researchade utkast under expertgranskning,
        inte slutgiltigt fastställt innehåll.
      </div>

      <p style={{ marginTop: 24 }}>
        <Link href="/kompass" className="btn btn-primary">
          Starta kompassen →
        </Link>
      </p>
    </main>
  );
}
