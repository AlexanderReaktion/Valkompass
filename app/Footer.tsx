import Link from "next/link";

export default function Footer() {
  return (
    <footer className="sitefooter">
      <nav>
        <Link href="/om">Om &amp; metod</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/integritet">Integritet</Link>
      </nav>
      <p>
        Vägledande verktyg, inte en rekommendation att rösta på ett visst parti. Matchningen är
        deterministisk och förklarbar; fritextkommentarer tolkas av AI som ett separat, märkt lager.
      </p>
    </footer>
  );
}
