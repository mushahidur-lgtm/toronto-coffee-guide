import { getAllCafes } from "@/lib/data";
import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { SITE } from "@/lib/site";

// Same card as opengraph-image.tsx; without this file cafe pages would inherit the generic root twitter-image.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 86400;

export async function generateImageMetadata({ params }: { params: { slug: string } }) {
  const cafe = (await getAllCafes()).find((c) => c.slug === params.slug);
  return [{ id: "twitter", alt: cafe ? `${cafe.name}, ${cafe.neighbourhood}: ${SITE.name}` : SITE.name, size, contentType }];
}

export default async function Image({ params }: { params: { slug: string } }) {
  const cafe = (await getAllCafes()).find((c) => c.slug === params.slug);
  if (!cafe) return ogCard({ eyebrow: "Toronto, Ontario", title: SITE.tagline });
  // Skip "Vietnamese" when "Vietnamese Cafe" is already listed.
  const cuisines = cafe.cuisine_types.filter((cu) => !cafe.cafe_categories.some((t) => t.toLowerCase().startsWith(cu.toLowerCase())));
  const types = Array.from(new Set([...cafe.cafe_categories, ...cuisines])).slice(0, 3).join(" · ");
  return ogCard({ eyebrow: cafe.neighbourhood, title: cafe.name, subtitle: types || cafe.description || undefined });
}
