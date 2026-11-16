import type { Cafe } from "./types";

/**
 * Toronto coffee categories used by the /map explorer. A cafe can be in several.
 *
 * They're derived from the editorial data we already have (cafe_categories, cuisine_types, tags), never guessed.
 * To set them by hand, give the cafe an `explorer_categories` array (slugs below) in the seed file or database;
 * that replaces the derived list.
 */
export const EXPLORER_CATEGORIES = [
  { slug: "third-wave", label: "Third-Wave & Roasters", hint: "Specialty pour-overs, local micro-roasters" },
  { slug: "italian-espresso", label: "Italian Espresso Bars", hint: "Classic espresso at the counter, pastries" },
  { slug: "asian-matcha", label: "Asian-Inspired & Matcha", hint: "Kissaten, matcha & hojicha, Vietnamese phin, Korean cafes" },
  { slug: "bakery", label: "Bakery-Cafes", hint: "Sourdough, viennoiserie, pastry-focused" },
  { slug: "work-study", label: "Work & Study Cafes", hint: "Room to sit, laptop friendly, quiet or late hours" },
  { slug: "hybrid", label: "Multi-Concept & Hybrid", hint: "Coffee plus a bar, retail, records or live events" },
  { slug: "grab-and-go", label: "Grab-and-Go", hint: "Walk-up windows, commuter counters" },
  { slug: "chains", label: "Chains", hint: "Tim Hortons, Second Cup, Starbucks…" },
] as const;

export type ExplorerCategory = (typeof EXPLORER_CATEGORIES)[number]["slug"];
const SLUGS = new Set<string>(EXPLORER_CATEGORIES.map((c) => c.slug));
export const isExplorerCategory = (v: unknown): v is ExplorerCategory => typeof v === "string" && SLUGS.has(v);
export const explorerLabel = (slug: ExplorerCategory) => EXPLORER_CATEGORIES.find((c) => c.slug === slug)!.label;

/** Practical attributes. null = unknown (we don't have verified data), which never matches a filter. */
export interface CafeAttributes {
  categories: ExplorerCategory[];
  hasWifi: boolean | null;
  hasPatio: boolean | null;
  roastsInHouse: boolean | null;
  laptopFriendly: boolean | null;
}

const has = (list: string[], ...values: string[]) => values.some((v) => list.some((x) => x.toLowerCase() === v));

export function deriveCategories(c: Cafe): ExplorerCategory[] {
  if (c.explorer_categories.length) return c.explorer_categories;
  const cats = c.cafe_categories;
  const out = new Set<ExplorerCategory>();
  if (has(cats, "specialty coffee", "roastery") || has(c.tags, "roaster", "single origin", "multi-roaster", "roasts in house", "small batch")) {
    out.add("third-wave");
  }
  if (has(c.cuisine_types, "italian")) out.add("italian-espresso");
  if (
    has(cats, "matcha cafe", "japanese cafe", "korean cafe", "vietnamese cafe", "tea house") ||
    has(c.cuisine_types, "japanese", "korean", "vietnamese", "taiwanese", "chinese")
  ) {
    out.add("asian-matcha");
  }
  if (has(cats, "bakery & cafe") || has(c.tags, "sourdough", "viennoiserie", "patisserie")) out.add("bakery");
  if (c.laptop_friendly === true || c.has_wifi === true || has(c.tags, "work friendly", "quiet", "late night")) out.add("work-study");
  if (has(c.tags, "bar", "wine bar", "listening bar", "live music", "comedy", "bean to bar")) out.add("hybrid");
  if (has(c.tags, "takeaway", "path", "street food", "walk-up")) out.add("grab-and-go");
  if (c.is_chain) out.add("chains");
  return [...out];
}

/** `livePatio` is Google's outdoorSeating (fetched live, never stored). Editorial values win. */
export function deriveAttributes(c: Cafe, livePatio: boolean | null = null): CafeAttributes {
  return {
    categories: deriveCategories(c),
    hasWifi: c.has_wifi,
    hasPatio: c.has_patio ?? (has(c.tags, "patio") ? true : livePatio),
    roastsInHouse: c.roasts_in_house ?? (has(c.cafe_categories, "roastery") || has(c.tags, "roaster", "roasts in house") ? true : null),
    laptopFriendly: c.laptop_friendly ?? (c.has_wifi === true || has(c.tags, "work friendly", "quiet") ? true : null),
  };
}
