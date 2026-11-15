/**
 * Structured, weighted search over cafe names, neighbourhoods, categories, cuisine,
 * specialty drinks, food offerings, tags and descriptions.
 *
 * - case- and accent-insensitive ("bánh mì" == "banh mi")
 * - partial matching at word starts ("matc" → "matcha", "vietnam" → "vietnamese")
 * - light plural stemming ("croissants" → "croissant", "bakeries" → "bakery")
 * - synonym expansion ("croissant" also finds pastries, "vietnamese" finds ca phe / bac xiu …)
 * - every query concept must match (AND), any synonym of a concept may match (OR)
 *
 * Runs identically in the browser (instant results as you type) and on the server (/api/cafes).
 */
import type { Cafe } from "./types";
import { getNeighbourhood, matchesNeighbourhoodFilter } from "./neighbourhoods";
import { isOpenNow } from "./hours";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const stemPhrase = (s: string) => normalize(s).split(" ").filter(Boolean).map(stem).join(" ");

/** Concept → terms that should also match. Keys/terms are written naturally; they are normalized below. */
const SYNONYMS_RAW: Record<string, string[]> = {
  matcha: ["matcha", "green tea latte", "matcha cafe"],
  hojicha: ["hojicha", "roasted green tea"],
  vietnamese: [
    "vietnamese", "viet", "ca phe", "phin", "bac xiu", "egg coffee", "salt coffee", "coconut coffee",
    "banh mi", "vietnamese cafe",
  ],
  "vietnamese coffee": [
    "vietnamese coffee", "vietnamese iced coffee", "ca phe", "phin", "bac xiu", "egg coffee", "salt coffee",
    "coconut coffee", "vietnamese cafe",
  ],
  japanese: [
    "japanese", "japanese cafe", "matcha", "hojicha", "genmaicha", "wagashi", "mochi", "souffle pancake",
    "kissaten", "sando",
  ],
  "japanese cafe": ["japanese", "japanese cafe", "kissaten"],
  korean: ["korean", "korean cafe", "bingsu", "croffle", "hodo", "injeolmi", "dalgona", "korean toast"],
  "korean cafe": ["korean", "korean cafe"],
  croissant: ["croissant", "pastry", "pastries", "viennoiserie", "croffle"],
  pastry: ["pastry", "pastries", "croissant", "viennoiserie", "pastel de nata", "cinnamon bun", "cardamom bun", "tart", "danish", "patisserie", "baked goods"],
  bakery: ["bakery", "bakeshop", "bakery and cafe", "baked goods", "bread", "patisserie", "boulangerie"],
  "cold brew": ["cold brew", "nitro"],
  brunch: ["brunch", "brunch cafe", "breakfast", "all day breakfast", "eggs benedict"],
  breakfast: ["breakfast", "brunch", "all day breakfast"],
  "specialty coffee": ["specialty coffee", "roaster", "roastery", "pour over", "single origin", "third wave"],
  "pour over": ["pour over", "filter coffee", "pourover"],
  dessert: ["dessert", "dessert cafe", "bingsu", "cake", "gelato", "ice cream", "souffle pancake", "mochi", "macaron", "cheesecake"],
  "bubble tea": ["bubble tea", "boba"],
  tea: ["tea", "matcha", "hojicha", "chai", "genmaicha"],
  vegan: ["vegan", "plant based"],
  italian: ["italian", "espresso bar", "gelato", "cannoli"],
  greek: ["greek", "spanakopita", "galaktoboureko", "bougatsa"],
  portuguese: ["portuguese", "pastel de nata", "natas"],
  french: ["french", "patisserie", "croissant", "macaron", "viennoiserie"],
  roaster: ["roaster", "roastery", "roasts in house"],
};

/** Words dropped from multi-word queries ("matcha cafe near kensington" → matcha + kensington). */
const STOP = new Set(["cafe", "caf", "coffee shop", "shop", "the", "a", "an", "and", "in", "near", "at", "of", "toronto", "best", "spot", "place", "with", "for"]);

const SYNONYMS = new Map<string, string[]>(
  Object.entries(SYNONYMS_RAW).map(([k, v]) => [stemPhrase(k), Array.from(new Set([k, ...v].map(stemPhrase)))]),
);
const MAX_PHRASE = Math.max(...Array.from(SYNONYMS.keys()).map((k) => k.split(" ").length));

interface Group {
  label: string;
  terms: { t: string; w: number }[];
}

export function parseQuery(query: string): Group[] {
  const tokens = normalize(query).split(" ").filter(Boolean).map(stem);
  if (!tokens.length) return [];
  const meaningful = tokens.filter((t) => !STOP.has(t));
  const toks = meaningful.length ? meaningful : tokens;

  const groups: Group[] = [];
  for (let i = 0; i < toks.length; ) {
    let matched = false;
    for (let n = Math.min(MAX_PHRASE, toks.length - i); n >= 2; n--) {
      const phrase = toks.slice(i, i + n).join(" ");
      const syn = SYNONYMS.get(phrase);
      if (syn) {
        groups.push({ label: phrase, terms: syn.map((t) => ({ t, w: t === phrase ? 1 : 0.35 })) });
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const tok = toks[i];
    const terms = new Map<string, number>([[tok, 1]]);
    for (const t of SYNONYMS.get(tok) ?? []) if (!terms.has(t)) terms.set(t, 0.35);
    // Partial word being typed: "japan" → japanese concept, "vietnam" → vietnamese concept.
    if (tok.length >= 4 && !SYNONYMS.has(tok)) {
      for (const [key, syn] of SYNONYMS) {
        if (!key.includes(" ") && key.startsWith(tok)) for (const t of syn) if (!terms.has(t)) terms.set(t, 0.3);
      }
    }
    groups.push({ label: tok, terms: Array.from(terms, ([t, w]) => ({ t, w })) });
    i += 1;
  }
  return groups;
}

interface Field {
  key: "name" | "category" | "neighbourhood" | "drink" | "food" | "cuisine" | "tag" | "description" | "address";
  weight: number;
  text: string; // padded, normalized + stemmed
  raw: string;
}

const pad = (s: string) => {
  const n = normalize(s);
  const st = stemPhrase(s);
  return ` ${n} ${st === n ? "" : st + " "}`;
};

export interface IndexedCafe<T extends Cafe = Cafe> {
  cafe: T;
  fields: Field[];
}

export function indexCafe<T extends Cafe>(cafe: T): IndexedCafe<T> {
  const fields: Field[] = [];
  const add = (key: Field["key"], weight: number, raw: string | null | undefined) => {
    if (raw) fields.push({ key, weight, raw, text: pad(raw) });
  };
  add("name", 10, cafe.name);
  const hood = getNeighbourhood(cafe.neighbourhood);
  add("neighbourhood", 6, [cafe.neighbourhood, hood?.region, ...(hood?.aliases ?? [])].filter(Boolean).join(" · "));
  cafe.cafe_categories.forEach((c) => add("category", 6, c));
  cafe.specialty_drinks.forEach((d) => add("drink", 5, d));
  cafe.food_offerings.forEach((f) => add("food", 5, f));
  cafe.cuisine_types.forEach((c) => add("cuisine", 5, c));
  cafe.tags.forEach((t) => add("tag", 3, t));
  add("description", 2, cafe.description);
  add("address", 1, cafe.address);
  return { cafe, fields };
}

export interface SearchHit<T extends Cafe = Cafe> {
  cafe: T;
  score: number;
  /** Menu items / attributes that matched, e.g. ["Matcha latte"]. */
  highlights: string[];
}

export function searchIndex<T extends Cafe>(index: IndexedCafe<T>[], query: string): SearchHit<T>[] {
  const groups = parseQuery(query);
  if (!groups.length) return index.map((i) => ({ cafe: i.cafe, score: 0, highlights: [] }));

  const phraseTokens = normalize(query).split(" ").filter(Boolean);
  const phrase = phraseTokens.length > 1 ? phraseTokens.map(stem).join(" ") : null;
  const hits: SearchHit<T>[] = [];
  for (const { cafe, fields } of index) {
    let total = 0;
    const highlights: string[] = [];
    let ok = true;
    for (const g of groups) {
      let best = 0;
      let bestHighlight: string | null = null;
      for (const { t, w } of g.terms) {
        let s = 0;
        let hl: string | null = null;
        for (const f of fields) {
          if (!f.text.includes(` ${t}`)) continue;
          const exact = f.text.includes(` ${t} `) ? 1 : 0.7;
          s += f.weight * exact;
          if (!hl && (f.key === "drink" || f.key === "food" || f.key === "tag" || f.key === "cuisine")) hl = f.raw;
        }
        s *= w;
        if (s > best) {
          best = s;
          bestHighlight = hl;
        }
      }
      if (best === 0) {
        ok = false;
        break;
      }
      total += best;
      if (bestHighlight && !highlights.includes(bestHighlight)) highlights.push(bestHighlight);
    }
    if (!ok) continue;
    // Whole-phrase bonus: "egg coffee" as written beats "eggs benedict" + "drip coffee".
    if (phrase && fields.some((f) => f.text.includes(` ${phrase}`))) total += 25;
    hits.push({ cafe, score: total, highlights: highlights.slice(0, 3) });
  }
  return hits;
}

export const SORT_KEYS = ["relevance", "az", "za", "neighbourhood"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const isSortKey = (v: unknown): v is SortKey => typeof v === "string" && (SORT_KEYS as readonly string[]).includes(v);

export interface Filters {
  query: string;
  neighbourhoods: string[];
  types: string[];
  sort: SortKey;
  /** Only cafes whose listed hours say they're open right now (Toronto time). Unknown hours are excluded. */
  openNow: boolean;
}

export const EMPTY_FILTERS: Filters = { query: "", neighbourhoods: [], types: [], sort: "relevance", openNow: false };

export function applyFilters<T extends Cafe>(index: IndexedCafe<T>[], f: Filters, now: Date = new Date()): SearchHit<T>[] {
  let hits = searchIndex(index, f.query);
  if (f.openNow) {
    hits = hits.filter((h) => isOpenNow(h.cafe.opening_hours, now) === true);
  }
  if (f.neighbourhoods.length) {
    hits = hits.filter((h) => f.neighbourhoods.some((n) => matchesNeighbourhoodFilter(h.cafe.neighbourhood, n)));
  }
  if (f.types.length) {
    hits = hits.filter((h) => f.types.some((t) => h.cafe.cafe_categories.includes(t)));
  }
  const byName = (a: SearchHit<T>, b: SearchHit<T>) => a.cafe.name.localeCompare(b.cafe.name, "en-CA");
  const sort = f.sort === "relevance" && !f.query.trim() ? "az" : f.sort;
  switch (sort) {
    case "az":
      return hits.sort(byName);
    case "za":
      return hits.sort((a, b) => byName(b, a));
    case "neighbourhood":
      return hits.sort((a, b) => a.cafe.neighbourhood.localeCompare(b.cafe.neighbourhood) || byName(a, b));
    default:
      return hits.sort((a, b) => b.score - a.score || byName(a, b));
  }
}

/** Convenience for one-off server/script use. */
export function searchCafes<T extends Cafe>(cafes: T[], query: string): SearchHit<T>[] {
  return applyFilters(cafes.map(indexCafe), { ...EMPTY_FILTERS, query });
}
