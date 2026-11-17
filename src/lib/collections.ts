import type { Cafe } from "./types";
import { DRINK_FACETS, FOOD_FACETS, AMENITY_FACETS } from "./facets";

/**
 * Editorial collections (homepage cards, /categories, /toronto/<slug> landing pages).
 *
 * Membership comes from structured data only (menu items, categories, verified attributes) or, for lists that
 * need human judgement, the cafe's `collections` field. A collection is shown only once MIN_COLLECTION_SIZE
 * cafes qualify, so there are never thin or empty pages.
 */
export const MIN_COLLECTION_SIZE = 3;

const facet = (list: typeof DRINK_FACETS, key: string) => list.find((f) => f.key === key)!.test;
const picked = (slug: string) => (c: Cafe) => c.collections.includes(slug);

export interface Collection {
  slug: string;
  title: string;
  /** One line for cards. */
  description: string;
  /** A short, specific paragraph for the landing page (unique per collection, not keyword filler). */
  intro: string;
  /** Search the explorer can run for "See all in the explorer". */
  query?: string;
  test: (c: Cafe) => boolean;
}

export const COLLECTIONS: Collection[] = [
  {
    slug: "matcha-cafes",
    title: "Best Matcha in Toronto",
    description: "Whisked matcha, hojicha and green tea lattes, from Japanese tea houses to coffee bars.",
    intro:
      "Every cafe here lists matcha on its menu, from ceremonial bowls and iced lattes to strawberry and pandan variations. Several also pour hojicha, the roasted green tea that's mellower and a little nutty, and a few pair their tea with Japanese sweets.",
    query: "matcha",
    test: facet(DRINK_FACETS, "matcha"),
  },
  {
    slug: "vietnamese-coffee",
    title: "Vietnamese Coffee",
    description: "Phin-dripped cà phê, egg coffee, salt coffee and coconut coffee.",
    intro:
      "Toronto's Vietnamese cafes brew strong, dark coffee through a phin filter and sweeten it with condensed milk. Look for cà phê trứng (egg coffee, whipped and custardy), salt coffee topped with salted cream, and coconut coffee blended like a slush.",
    query: "vietnamese coffee",
    test: facet(DRINK_FACETS, "vietnamese-coffee"),
  },
  {
    slug: "specialty-coffee",
    title: "Specialty Coffee",
    description: "Third-wave roasters and espresso bars that take sourcing and brewing seriously.",
    intro:
      "These are the city's specialty coffee shops and roasteries: places that buy traceable beans, roast them carefully and dial in espresso and pour-over by hand. Several roast in house, so you can usually buy what you drank by the bag.",
    query: "specialty coffee",
    test: (c) => c.cafe_categories.some((x) => x === "Specialty Coffee" || x === "Roastery"),
  },
  {
    slug: "coffee-and-pastries",
    title: "Coffee & Pastries",
    description: "Good espresso with croissants, buns, tarts and other bakery counters worth the trip.",
    intro:
      "Bakeries and cafes where the pastry case matters as much as the espresso machine: laminated croissants, Portuguese custard tarts, Swedish cardamom buns and Greek phyllo pastries, with a proper coffee alongside.",
    query: "pastries",
    test: (c) => facet(FOOD_FACETS, "pastries")(c) && c.specialty_drinks.length > 0,
  },
  {
    slug: "japanese-cafes",
    title: "Japanese Cafes",
    description: "Kissaten-style coffee, matcha, soufflé pancakes and Japanese sweets.",
    intro:
      "From quiet kissaten-style rooms to dessert cafes known for jiggly soufflé pancakes, these cafes bring Japanese tea and coffee culture to Toronto, with matcha, hojicha, wagashi and roll cakes on the menu.",
    query: "japanese",
    test: (c) => c.cafe_categories.includes("Japanese Cafe"),
  },
  {
    slug: "work-friendly-cafes",
    title: "Best Cafes to Work From",
    description: "Room to sit, laptop-friendly and calm enough to get things done.",
    intro:
      "Cafes our listings mark as laptop- or work-friendly: places with space to settle in. Policies change, especially at busy times, so it's worth checking with the cafe before planning a long session.",
    query: "laptop friendly",
    test: facet(AMENITY_FACETS, "laptop-friendly"),
  },
  {
    slug: "hidden-gems",
    title: "Hidden Gems",
    description: "Small, easy-to-miss places locals love.",
    intro: "Small, easy-to-miss cafes chosen by our editors: below-grade rooms, side-street counters and neighbourhood favourites.",
    test: (c) => picked("hidden-gems")(c) || c.tags.includes("hidden gem"),
  },
  {
    slug: "beautiful-cafes",
    title: "Beautiful Cafes in Toronto",
    description: "Rooms worth visiting for the space as much as the coffee.",
    intro: "Cafes chosen by our editors for the room itself: architecture, light and design worth the visit.",
    test: picked("beautiful-cafes"),
  },
];

export const getCollection = (slug: string) => COLLECTIONS.find((c) => c.slug === slug);

/** Collections with enough cafes to show, with their members (featured first, then by name). */
export function visibleCollections<T extends Cafe>(cafes: T[]): { collection: Collection; cafes: T[] }[] {
  return COLLECTIONS.map((collection) => ({
    collection,
    cafes: cafes.filter(collection.test).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "en-CA")),
  })).filter((x) => x.cafes.length >= MIN_COLLECTION_SIZE);
}
