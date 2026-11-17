import type { Cafe } from "./types";
import { DRINK_FACETS, FOOD_FACETS } from "./facets";

/**
 * Groups a cafe's listed menu items (specialty_drinks / food_offerings, the editorial data) into sections for the
 * cafe page. Nothing is added: an item only appears if it's in the cafe's own data.
 */
export interface MenuSections {
  coffee: string[];
  tea: string[];
  specialty: string[];
  food: string[];
}

const COMBINING = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
const norm = (s: string) => s.normalize("NFD").replace(COMBINING, "").toLowerCase();

// Signature / non-standard drinks first (egg coffee is coffee, but it belongs with the specialties).
const SPECIALTY = /egg|salt|coconut|durian|yogurt|pandan|purple|sweet potato|mango|drinking chocolate|hot chocolate|strawberry|blueberry|cream coffee|creme coffee|float/;
const TEA = /matcha|hojicha|genmaicha|\btea\b|chai|loose-leaf|loose leaf|bubble|boba/;

export function menuSections(c: Pick<Cafe, "specialty_drinks" | "food_offerings">): MenuSections {
  const out: MenuSections = { coffee: [], tea: [], specialty: [], food: [...c.food_offerings] };
  for (const item of c.specialty_drinks) {
    const n = norm(item);
    if (SPECIALTY.test(n)) out.specialty.push(item);
    else if (TEA.test(n)) out.tea.push(item);
    else out.coffee.push(item);
  }
  return out;
}

/**
 * Similar cafes: same neighbourhood, same venue type, shared drinks/food (facets) and shared categories.
 * Returns the best `limit`, excluding the cafe itself.
 */
export function similarCafes<T extends Cafe>(cafe: T, all: T[], limit = 3): T[] {
  const facetsOf = (c: Cafe) => new Set([...DRINK_FACETS, ...FOOD_FACETS].filter((f) => f.test(c)).map((f) => f.key));
  const mine = facetsOf(cafe);
  return all
    .filter((c) => c.id !== cafe.id)
    .map((c) => {
      const theirs = facetsOf(c);
      let score = 0;
      if (c.neighbourhood === cafe.neighbourhood) score += 3;
      if (c.venue_type === cafe.venue_type) score += 2;
      for (const k of mine) if (theirs.has(k) && k !== "espresso" && k !== "latte") score += 1.5; // espresso/latte are everywhere
      for (const k of c.cafe_categories) if (cafe.cafe_categories.includes(k)) score += 1;
      return { c, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, "en-CA"))
    .slice(0, limit)
    .map((x) => x.c);
}
