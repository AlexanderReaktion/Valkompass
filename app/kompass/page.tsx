import { activeCatalog, activeParties, activeScale } from "@/src/data/activeCatalog.ts";
import Kompass from "./Kompass.tsx";

export default function KompassPage() {
  return <Kompass catalog={activeCatalog} parties={activeParties} scale={activeScale} />;
}
