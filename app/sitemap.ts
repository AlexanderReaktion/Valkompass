import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/kompass`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/om`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/integritet`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
