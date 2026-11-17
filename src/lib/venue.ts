/**
 * Primary venue type: every listing is exactly one of these (used for the /cafes tabs, card badges and map).
 *
 * Derived from the editorial cafe_categories / tags unless a listing sets `venue_type` explicitly.
 */
export const VENUE_TYPES = [
  {
    slug: "specialty-cafe",
    label: "Independent & Specialty Cafes",
    short: "Specialty Cafes",
    badge: "Cafe",
    hint: "Third-wave cafes, micro-roasters and indie neighbourhood spots",
  },
  {
    slug: "tea-matcha",
    label: "Tea Houses & Matcha Bars",
    short: "Tea & Matcha",
    badge: "Tea & Matcha",
    hint: "Matcha and hojicha cafes, Chinese and Taiwanese tea houses, bubble tea and loose-leaf tea",
  },
  {
    slug: "restaurant-coffee",
    label: "Restaurants & Cafes Serving Coffee",
    short: "Restaurants with Coffee",
    badge: "Restaurant & Bakery",
    hint: "Brunch spots, bistros, Italian espresso bars and bakeries with good coffee",
  },
] as const;

export type VenueType = (typeof VENUE_TYPES)[number]["slug"];

const SLUGS = new Set<string>(VENUE_TYPES.map((v) => v.slug));
export const isVenueType = (v: unknown): v is VenueType => typeof v === "string" && SLUGS.has(v);
export const venueInfo = (v: VenueType) => VENUE_TYPES.find((x) => x.slug === v)!;

interface VenueInput {
  cafe_categories: string[];
  tags: string[];
}

const has = (list: string[], ...values: string[]) => values.some((v) => list.some((x) => x.toLowerCase() === v));

/**
 * The badge a listing shows. Within "Restaurants & Cafes Serving Coffee", bakeries and traditional cafes say so,
 * instead of all reading "Restaurant & Bakery".
 */
export function venueBadge(venue: VenueType, c: VenueInput): string {
  if (venue !== "restaurant-coffee") return venueInfo(venue).badge;
  if (has(c.cafe_categories, "restaurant", "brunch cafe") || has(c.tags, "restaurant", "diner", "bistro")) return "Restaurant & Cafe";
  if (has(c.cafe_categories, "bakery & cafe")) return "Bakery & Cafe";
  if (has(c.cafe_categories, "traditional cafe")) return "Traditional Cafe";
  return venueInfo(venue).badge;
}

/** schema.org type for a listing's JSON-LD, following the same rule as the badge. */
export function schemaType(venue: VenueType, c: VenueInput): "Restaurant" | "Bakery" | "CafeOrCoffeeShop" {
  const badge = venueBadge(venue, c);
  if (badge === "Restaurant & Cafe" || badge === venueInfo("restaurant-coffee").badge) return "Restaurant";
  if (badge === "Bakery & Cafe") return "Bakery";
  return "CafeOrCoffeeShop";
}

export function deriveVenueType(c: VenueInput): VenueType {
  const cats = c.cafe_categories;
  const coffeeFirst = has(cats, "specialty coffee", "roastery", "vietnamese cafe");
  // Tea first: tea houses, and matcha cafes that aren't primarily coffee bars (Japanese matcha spots count).
  if (has(cats, "tea house") || (has(cats, "matcha cafe") && (!coffeeFirst || has(cats, "japanese cafe")))) return "tea-matcha";
  // Food first: restaurants, brunch places, bakeries and traditional cafes, unless it's a coffee shop at heart.
  if (
    !coffeeFirst &&
    !has(cats, "neighbourhood cafe") &&
    (has(cats, "restaurant", "brunch cafe", "bakery & cafe", "traditional cafe") || has(c.tags, "restaurant", "diner", "bistro"))
  ) {
    return "restaurant-coffee";
  }
  return "specialty-cafe";
}
