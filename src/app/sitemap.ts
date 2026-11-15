import type { MetadataRoute } from "next";
import { getAllCafes } from "@/lib/data";
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cafes = await getAllCafes();
  const used = new Set(cafes.map((c) => c.neighbourhood));
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/cafes`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE.url}/neighbourhoods`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/map`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE.url}/about`, changeFrequency: "yearly", priority: 0.3 },
    ...NEIGHBOURHOODS.filter((n) => used.has(n.name)).map((n) => ({
      url: `${SITE.url}/neighbourhoods/${n.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...cafes.map((c) => ({ url: `${SITE.url}/cafes/${c.slug}`, lastModified: c.updated_at, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
