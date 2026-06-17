import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Footer from "./Footer.tsx";
import CookieConsent from "./CookieConsent.tsx";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Valkompass 2026",
  description: "En genomgående, transparent och fakta-ankrad valkompass inför riksdagsvalet 2026.",
  openGraph: {
    title: "Valkompass 2026",
    description: "Tvådimensionell, transparent valkompass inför riksdagsvalet 13 september 2026.",
    locale: "sv_SE",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        {children}
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
