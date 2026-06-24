import { loadActiveDataset } from "@/src/data/activeCatalog.ts";
import Kompass from "./Kompass.tsx";

export const dynamic = "force-dynamic";

export default async function KompassPage() {
  const dataset = await loadActiveDataset();
  return (
    <Kompass
      catalog={dataset.catalog}
      parties={dataset.parties}
      scale={dataset.scale}
      sources={dataset.sources}
      isPublished={dataset.isPublished}
    />
  );
}
