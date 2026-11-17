import type { Cafe, CafeView } from "./types";
import { deriveAttributes, type CafeAttributes } from "./explorer";

/**
 * Drink / food / amenity filters. Each option matches structured data only (specialty_drinks, food_offerings,
 * tags, categories, cuisine, verified attributes), never the free-text description. Options that match no
 * cafe are hidden in the UI, so there are no filters the data can't support.
 *
 * Atmosphere and price level aren't here on purpose: there's no reliable data for them yet. Add the fields
 * to the cafe records first, then add facets here.
 */

const COMBINING = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
const norm = (s: string) => s.normalize("NFD").replace(COMBINING, "").toLowerCase();

type AnyCafe = Cafe & Partial<Pick<CafeView, "attributes">>;
const attrs = (c: AnyCafe): CafeAttributes => c.attributes ?? deriveAttributes(c);
const anyOf = (list: string[], re: RegExp) => list.some((x) => re.test(norm(x)));
const drinks = (c: AnyCafe) => [...c.specialty_drinks, ...c.tags];
const food = (c: AnyCafe) => [...c.food_offerings, ...c.tags];
const hasCat = (c: AnyCafe, ...names: string[]) => c.cafe_categories.some((x) => names.includes(x));

export interface Facet {
  key: string;
  label: string;
  test: (c: AnyCafe) => boolean;
}

export const DRINK_FACETS: Facet[] = [
  { key: "espresso", label: "Espresso", test: (c) => anyOf(c.specialty_drinks, /espresso|cortado|cappuccino|flat white/) },
  { key: "latte", label: "Latte", test: (c) => anyOf(c.specialty_drinks, /latte|cafe au lait|galao|flat white/) },
  { key: "matcha", label: "Matcha", test: (c) => anyOf(drinks(c), /matcha/) },
  { key: "hojicha", label: "Hojicha", test: (c) => anyOf(drinks(c), /hojicha/) },
  {
    key: "vietnamese-coffee",
    label: "Vietnamese Coffee",
    test: (c) =>
      hasCat(c, "Vietnamese Cafe") ||
      anyOf(drinks(c), /vietnamese|phin|bac xiu|ca phe|egg (creme |cream )?coffee|salt(ed)? (creme |cream )?coffee|coconut (condensed-milk )?coffee/),
  },
  { key: "egg-coffee", label: "Egg Coffee", test: (c) => anyOf(drinks(c), /egg (creme |cream )?coffee|ca phe trung/) },
  { key: "salt-coffee", label: "Salt Coffee", test: (c) => anyOf(drinks(c), /salt(ed)? (creme |cream )?coffee|sea salt/) },
  { key: "cold-brew", label: "Cold Brew", test: (c) => anyOf(drinks(c), /cold brew|nitro/) },
  { key: "bubble-tea", label: "Bubble Tea", test: (c) => anyOf(drinks(c), /bubble tea|boba|milk tea/) },
  { key: "specialty-tea", label: "Specialty Tea", test: (c) => anyOf(c.specialty_drinks, /loose-leaf|loose leaf|chai|genmaicha|japanese tea|tea drinks|^tea$/) },
];

export const FOOD_FACETS: Facet[] = [
  { key: "croissants", label: "Croissants", test: (c) => anyOf(food(c), /croissant|viennoiserie/) },
  { key: "cakes", label: "Cakes", test: (c) => anyOf(food(c), /\b(cakes?|cheesecake|lamingtons?)\b/) },
  { key: "cookies", label: "Cookies", test: (c) => anyOf(food(c), /cookie/) },
  { key: "sandwiches", label: "Sandwiches", test: (c) => anyOf(food(c), /sandwich|banh mi|toast/) },
  { key: "brunch", label: "Brunch", test: (c) => hasCat(c, "Brunch Cafe") || anyOf(food(c), /brunch|eggs benedict|all-day breakfast|breakfast/) },
  {
    key: "pastries",
    label: "Pastries",
    test: (c) => anyOf(food(c), /pastr|croissant|viennoiserie|nata|danish|tart|\bbuns?\b|macaron|brioche|phyllo|spanakopita|bougatsa|galaktoboureko|scone|\bpies?\b/),
  },
  {
    key: "japanese-desserts",
    label: "Japanese Desserts",
    test: (c) =>
      c.cuisine_types.includes("Japanese") && anyOf(food(c), /dessert|mochi|wagashi|souffle|cheesecake|roll cake|\bcakes?\b|soft serve|madeleine|sweets/),
  },
];

export const AMENITY_FACETS: Facet[] = [
  { key: "laptop-friendly", label: "Laptop-friendly", test: (c) => attrs(c).laptopFriendly === true },
  { key: "outdoor-seating", label: "Patio / outdoor seating", test: (c) => attrs(c).hasPatio === true },
  { key: "wifi", label: "Wi-Fi", test: (c) => attrs(c).hasWifi === true },
];

export const FACET_GROUPS = {
  drinks: { label: "Drinks", param: "d", facets: DRINK_FACETS },
  food: { label: "Food", param: "f", facets: FOOD_FACETS },
  amenities: { label: "Amenities", param: "a", facets: AMENITY_FACETS },
} as const;

export type FacetGroupKey = keyof typeof FACET_GROUPS;
export const FACET_GROUP_KEYS = Object.keys(FACET_GROUPS) as FacetGroupKey[];

const byKey = new Map(FACET_GROUP_KEYS.map((g) => [g, new Map(FACET_GROUPS[g].facets.map((f) => [f.key, f]))]));

export const isFacetKey = (group: FacetGroupKey, key: string) => byKey.get(group)!.has(key);

/** Within a group, any selected option may match (OR); across groups everything must match (AND). */
export function matchesFacets(c: AnyCafe, group: FacetGroupKey, selected: string[]): boolean {
  if (!selected.length) return true;
  const map = byKey.get(group)!;
  return selected.some((k) => map.get(k)?.test(c) ?? false);
}
