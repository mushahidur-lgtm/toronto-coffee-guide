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
import type { Cafe, CafeView } from "./types";
import { deriveAttributes } from "./explorer";
import { FACET_GROUP_KEYS, FACET_GROUPS, isFacetKey, matchesFacets } from "./facets";
import { parseDayRanges, parseHours } from "./hours";
import { getNeighbourhood, matchesNeighbourhoodFilter } from "./neighbourhoods";
import { isOpenNow } from "./hours";
import { isVenueType, type VenueType } from "./venue";

const VENUE_KEYWORDS: Record<VenueType, string> = {
  "specialty-cafe": "cafe coffee shop",
  "tea-matcha": "tea house tea shop",
  "restaurant-coffee": "restaurant bakery",
};

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
  croissant: ["croissant", "viennoiserie", "croffle"],
  pastry: ["pastry", "pastries", "croissant", "viennoiserie", "pastel de nata", "cinnamon bun", "cardamom bun", "tart", "danish", "patisserie", "baked goods"],
  bakery: ["bakery", "bakeshop", "bakery and cafe", "baked goods", "bread", "patisserie", "boulangerie"],
  "cold brew": ["cold brew", "nitro"],
  brunch: ["brunch", "brunch cafe", "breakfast", "all day breakfast", "eggs benedict"],
  breakfast: ["breakfast", "brunch", "all day breakfast"],
  "specialty coffee": ["specialty coffee", "roaster", "roastery", "pour over", "single origin", "third wave"],
  "pour over": ["pour over", "filter coffee", "pourover"],
  dessert: ["dessert", "dessert cafe", "bingsu", "cake", "gelato", "ice cream", "souffle pancake", "mochi", "macaron", "cheesecake"],
  "bubble tea": ["bubble tea", "boba", "milk tea"],
  tea: ["tea", "matcha", "hojicha", "chai", "genmaicha", "bubble tea", "milk tea", "loose leaf", "tea house"],
  chai: ["chai", "chai latte", "masala chai"],
  "tea house": ["tea house", "tea room", "tea shop", "loose leaf", "bubble tea"],
  "loose leaf": ["loose leaf", "loose leaf tea"],
  "milk tea": ["milk tea", "bubble tea", "boba"],
  restaurant: ["restaurant", "bistro", "diner", "brunch"],
  vegan: ["vegan", "plant based"],
  italian: ["italian", "espresso bar", "gelato", "cannoli"],
  greek: ["greek", "spanakopita", "galaktoboureko", "bougatsa"],
  portuguese: ["portuguese", "pastel de nata", "natas"],
  french: ["french", "patisserie", "croissant", "macaron", "viennoiserie"],
  roaster: ["roaster", "roastery", "roasts in house"],
  // Amenities and atmosphere (matched against verified attributes / editorial tags, never descriptions)
  "laptop friendly": ["laptop friendly", "work friendly", "remote work"],
  "work friendly": ["work friendly", "laptop friendly", "remote work"],
  "remote work": ["remote work", "work friendly", "laptop friendly"],
  "work from": ["work friendly", "laptop friendly"],
  wifi: ["wifi"],
  "wi fi": ["wifi"],
  "outdoor seating": ["outdoor seating", "patio"],
  patio: ["patio", "outdoor seating"],
  "late night": ["late night", "open late"],
  "open late": ["open late", "late night"],
  quiet: ["quiet"],
};

/** Words dropped from multi-word queries ("matcha cafe near kensington" → matcha + kensington). */
const STOP = new Set(["cafe", "caf", "coffee shop", "shop", "the", "a", "an", "and", "in", "near", "at", "of", "toronto", "best", "spot", "place", "with", "for", "around", "by", "good", "great", "some", "me", "i", "want", "where", "find"]);

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
  key: "name" | "category" | "neighbourhood" | "drink" | "food" | "cuisine" | "tag" | "amenity" | "address";
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
  // Neutral venue keywords (not the display label: "Tea Houses & Matcha Bars" would make every tea shop match "matcha").
  add("category", 4, VENUE_KEYWORDS[cafe.venue_type]);
  cafe.specialty_drinks.forEach((d) => add("drink", 5, d));
  cafe.food_offerings.forEach((f) => add("food", 5, f));
  cafe.cuisine_types.forEach((c) => add("cuisine", 5, c));
  cafe.tags.forEach((t) => add("tag", 3, t));
  // Descriptions are deliberately NOT indexed: a word in prose isn't evidence a cafe serves something.
  add("address", 1, cafe.address);
  const a = (cafe as Cafe & Partial<Pick<CafeView, "attributes">>).attributes ?? deriveAttributes(cafe);
  if (a.laptopFriendly) add("amenity", 5, "Laptop friendly, work friendly, remote work");
  if (a.hasPatio) add("amenity", 5, "Patio, outdoor seating");
  if (a.hasWifi) add("amenity", 5, "Wifi");
  if (a.roastsInHouse) add("amenity", 3, "Roasts in house, roaster");
  if (closesLate(cafe.opening_hours)) add("amenity", 4, "Late night, open late");
  return { cafe, fields };
}

/** Open at or after 9 pm on at least one day, according to the listed hours. */
export function closesLate(lines: string[] | null | undefined): boolean {
  return parseHours(lines).some((d) => (parseDayRanges(d.hours) ?? []).some((r) => r.end >= 21 * 60));
}

// ---- typo tolerance -----------------------------------------------------------------
const vocabCache = new WeakMap<object, string[]>();
function vocabulary(index: IndexedCafe[]): string[] {
  const hit = vocabCache.get(index);
  if (hit) return hit;
  const words = new Set<string>();
  for (const { fields } of index) for (const f of fields) for (const w of f.text.split(" ")) if (w.length >= 4) words.add(w);
  const list = [...words];
  vocabCache.set(index, list);
  return list;
}

/** Damerau-Levenshtein distance, giving up once it exceeds max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** For a word that matches nothing, the closest real words in the index ("croisant" -> "croissant"). */
export function corrections(index: IndexedCafe[], word: string): string[] {
  if (word.length < 5 || word.includes(" ")) return [];
  const vocab = vocabulary(index);
  if (vocab.some((w) => w.startsWith(word))) return [];
  const max = word.length >= 8 ? 2 : 1;
  const scored = vocab.map((w) => [w, editDistance(word, w, max)] as const).filter(([, d]) => d <= max);
  if (!scored.length) return [];
  const best = Math.min(...scored.map(([, d]) => d));
  return scored.filter(([, d]) => d === best).map(([w]) => w).slice(0, 3);
}

export interface SearchHit<T extends Cafe = Cafe> {
  cafe: T;
  score: number;
  /** True when no cafe matched every word and this one matches only some (shown as "close matches"). */
  partial?: boolean;
  /** The whole multi-word query appears as a phrase in one of this cafe's fields. */
  phrase?: boolean;
  /** Menu items / attributes that matched, e.g. ["Matcha latte"]. */
  highlights: string[];
}

export function searchIndex<T extends Cafe>(index: IndexedCafe<T>[], query: string): SearchHit<T>[] {
  const groups = parseQuery(query);
  if (!groups.length) return index.map((i) => ({ cafe: i.cafe, score: 0, highlights: [] }));
  // Typo tolerance: a single word that matches nothing gets its nearest real words as alternatives.
  for (const g of groups) {
    for (const fix of corrections(index, g.label)) if (!g.terms.some((t) => t.t === fix)) g.terms.push({ t: fix, w: 0.8 });
  }
  const strict = runSearch(index, groups, query, false);
  if (groups.length >= 2) {
    // "egg coffee": if some cafes have the exact phrase on their menu, show only those
    // (not "eggs benedict" + "drip coffee").
    const exact = strict.filter((h) => h.phrase);
    if (exact.length) return exact;
  }
  if (strict.length || groups.length < 2) return strict;
  // Nothing matches every word ("quiet cafe with wifi"): fall back to cafes matching some of them.
  return runSearch(index, groups, query, true);
}

function runSearch<T extends Cafe>(index: IndexedCafe<T>[], groups: Group[], query: string, relaxed: boolean): SearchHit<T>[] {

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
        // 1–2 letter words ("de", "co") only match whole words, or "de" would match "dessert".
        // Whole words only for 1–2 letter words ("de" ≠ "dessert") and for complete known terms
        // ("chai" ≠ "chain"); anything else may be a word still being typed, so it prefix-matches.
        const wholeWordOnly = t.length < 3 || SYNONYMS.has(t);
        for (const f of fields) {
          if (!f.text.includes(wholeWordOnly ? ` ${t} ` : ` ${t}`)) continue;
          const exact = f.text.includes(` ${t} `) ? 1 : 0.7;
          s += f.weight * exact;
          if (!hl && (f.key === "drink" || f.key === "food" || f.key === "tag" || f.key === "cuisine" || f.key === "amenity")) hl = f.raw.split(",")[0];
        }
        s *= w;
        if (s > best) {
          best = s;
          bestHighlight = hl;
        }
      }
      if (best === 0) {
        if (relaxed) continue;
        ok = false;
        break;
      }
      total += best;
      if (bestHighlight && !highlights.includes(bestHighlight)) highlights.push(bestHighlight);
    }
    if (!ok || total === 0) continue;
    // Whole-phrase bonus: "egg coffee" as written beats "eggs benedict" + "drip coffee".
    const phraseHit = !!phrase && fields.some((f) => f.key !== "address" && f.text.includes(` ${phrase}`));
    if (phraseHit) total += 25;
    hits.push({ cafe, score: total, highlights: highlights.slice(0, 3), ...(relaxed ? { partial: true } : {}), ...(phraseHit ? { phrase: true } : {}) });
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
  /** Primary venue type tab (null = all). */
  venue: VenueType | null;
  /** Facet keys from lib/facets.ts (any-of within a group). */
  drinks: string[];
  food: string[];
  amenities: string[];
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  neighbourhoods: [],
  types: [],
  sort: "relevance",
  openNow: false,
  venue: null,
  drinks: [],
  food: [],
  amenities: [],
};

/** Filters → URL params (inverse of filtersFromParams). Default values are left out. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.neighbourhoods.length) p.set("n", f.neighbourhoods.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.sort !== "relevance") p.set("sort", f.sort);
  if (f.openNow) p.set("open", "1");
  if (f.venue) p.set("venue", f.venue);
  for (const g of FACET_GROUP_KEYS) if (f[g].length) p.set(FACET_GROUPS[g].param, f[g].join(","));
  return p;
}

/**
 * Filters from URL search params (?q=matcha&n=Chinatown,Downtown&type=Korean%20Cafe&sort=az&open=1).
 * Shared by the server-rendered /cafes page (works without JavaScript) and the client explorer.
 */
export function filtersFromParams(get: (key: string) => string | null | undefined): Filters {
  const list = (k: string) =>
    (get(k) ?? "")
      .split(",")
      .map((s) => s.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 20);
  const sort = get("sort");
  return {
    query: (get("q") ?? "").slice(0, 200),
    neighbourhoods: list("n"),
    types: list("type"),
    sort: isSortKey(sort) ? sort : "relevance",
    openNow: get("open") === "1",
    venue: isVenueType(get("venue")) ? (get("venue") as VenueType) : null,
    ...(Object.fromEntries(
      FACET_GROUP_KEYS.map((g) => [
        g,
        (get(FACET_GROUPS[g].param) ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter((v, i, arr) => v && isFacetKey(g, v) && arr.indexOf(v) === i),
      ]),
    ) as Pick<Filters, "drinks" | "food" | "amenities">),
  };
}

export function applyFilters<T extends Cafe>(index: IndexedCafe<T>[], f: Filters, now: Date = new Date()): SearchHit<T>[] {
  let hits = searchIndex(index, f.query);
  if (f.openNow) {
    hits = hits.filter((h) => isOpenNow(h.cafe.opening_hours, now) === true);
  }
  if (f.venue) {
    hits = hits.filter((h) => h.cafe.venue_type === f.venue);
  }
  for (const g of FACET_GROUP_KEYS) {
    if (f[g]?.length) hits = hits.filter((h) => matchesFacets(h.cafe, g, f[g]));
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
