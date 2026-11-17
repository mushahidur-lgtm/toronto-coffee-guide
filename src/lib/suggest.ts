import type { Cafe } from "./types";
import { NEIGHBOURHOODS } from "./neighbourhoods";
import { normalize } from "./search";

export type Suggestion =
  | { kind: "cafe"; label: string; detail: string; slug: string }
  | { kind: "neighbourhood"; label: string; detail: string }
  | { kind: "menu"; label: string; detail: string };

/**
 * Autocomplete for the search box: cafe names (go straight to the page), neighbourhoods and menu items
 * (drinks / food actually listed by at least one cafe). Matches word starts, case- and accent-insensitive.
 */
export function suggest(cafes: Cafe[], query: string, limit = 8): Suggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const wordStart = (s: string) => {
    const n = normalize(s);
    return n.startsWith(q) || n.includes(` ${q}`);
  };

  const cafeHits: Suggestion[] = cafes
    .filter((c) => wordStart(c.name))
    .sort((a, b) => Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((c) => ({ kind: "cafe", label: c.name, detail: c.neighbourhood, slug: c.slug }));

  const used = new Set(cafes.map((c) => c.neighbourhood));
  const hoodHits: Suggestion[] = NEIGHBOURHOODS.filter((n) => used.has(n.name) && (wordStart(n.name) || (n.aliases ?? []).some(wordStart)))
    .slice(0, 2)
    .map((n) => ({ kind: "neighbourhood", label: n.name, detail: `${cafes.filter((c) => c.neighbourhood === n.name).length} places` }));

  const items = new Map<string, { label: string; count: number }>();
  for (const c of cafes) {
    for (const item of [...c.specialty_drinks, ...c.food_offerings]) {
      if (!wordStart(item)) continue;
      const key = normalize(item);
      const cur = items.get(key);
      items.set(key, { label: cur?.label ?? item, count: (cur?.count ?? 0) + 1 });
    }
  }
  const menuHits: Suggestion[] = [...items.values()]
    .sort((a, b) => b.count - a.count || a.label.length - b.label.length)
    .slice(0, 4)
    .map((m) => ({ kind: "menu", label: m.label, detail: `${m.count} ${m.count === 1 ? "place" : "places"}` }));

  return [...menuHits, ...cafeHits, ...hoodHits].slice(0, limit);
}
