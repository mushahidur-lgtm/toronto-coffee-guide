/**
 * Runs the spec's search examples (and combined filters) against the seed data.
 *   npm run test:search
 */
import seed from "../data/cafes.seed.json";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { applyFilters, EMPTY_FILTERS, indexCafe, type Filters } from "../src/lib/search";

const cafes = (seed as Record<string, unknown>[]).map(normalizeCafe);
const index = cafes.map(indexCafe);

const cases: { q: string; f?: Partial<Filters>; min: number; mustInclude?: string[]; mustExclude?: string[]; first?: string }[] = [
  { q: "Matcha", min: 8, mustInclude: ["Neo Coffee Bar — Frederick", "Tsujiri", "Rustle & Still"] },
  { q: "matc", min: 8, mustInclude: ["Tsujiri"] },
  { q: "Vietnamese", min: 12, mustInclude: ["Cộng Cà Phê — Annex", "Banh Haus", "+84 Café"] },
  { q: "vietnam", min: 12 },
  { q: "Croissant", min: 8, mustInclude: ["Bonjour Brioche", "Dineen Coffee Co."] },
  { q: "croissants", min: 8 },
  { q: "Cold brew", min: 1, mustInclude: ["Pilot Coffee Roasters — Wagstaff Tasting Room"] },
  { q: "Japanese", min: 10, mustInclude: ["Fuwa Fuwa Dessert Cafe", "915 Dupont"] },
  { q: "Korean", min: 9, mustInclude: ["HANBINGO", "Dessert Fox"] },
  { q: "Specialty coffee", min: 30 },
  { q: "Downtown", min: 30, mustInclude: ["Moonbean Coffee Company"], mustExclude: ["Cafe Daily"] },
  { q: "Kensington Market", min: 8, mustInclude: ["FIKA Cafe"], mustExclude: ["Dineen Coffee Co."] },
  { q: "kensington", min: 8 },
  { q: "Vietnamese Coffee", min: 12 },
  { q: "Japanese Cafes", min: 10 },
  { q: "Bakeries", min: 12, mustInclude: ["Wanda's Pie in the Sky"] },
  { q: "Brunch", min: 8, mustInclude: ["Lady Marmalade"] },
  { q: "Pastries", min: 15 },
  { q: "egg coffee", min: 3 },
  { q: "bánh mì", min: 2 },
  { q: "bingsu", min: 5 },
  { q: "matcha kensington", min: 1, mustInclude: ["Little Pebbles"] },
  { q: "PILOT", min: 3 },
  // 1–2 letter words match whole words only ("de" must not match "dessert").
  { q: "de mello", min: 1, first: "De Mello Coffee — Bloor East" },
  { q: "bloor east", min: 1, first: "De Mello Coffee — Bloor East" },
  // Venue taxonomy: tea houses and restaurants/bakeries serving coffee.
  { q: "matcha", min: 10, mustInclude: ["Tsujiri", "Little Pebbles"] },
  { q: "bubble tea", min: 6, mustInclude: ["Chatime — Bloor West", "The Alley — Bloor West", "Kung Fu Tea — Danforth"] },
  { q: "milk tea", min: 4, mustInclude: ["Machi Machi — Yonge & Wellesley"] },
  { q: "loose leaf", min: 2, mustInclude: ["Tao Tea Leaf — Yonge Street"] },
  { q: "tea house", min: 8, mustInclude: ["ICHA Tea — Spadina"] },
  { q: "chai", min: 1, mustInclude: ["Moonbean Coffee Company"] },
  { q: "brunch", min: 10, mustInclude: ["Mildred’s Temple Kitchen", "Maha’s Brunch", "Lady Marmalade"] },
  { q: "bistro", min: 1, mustInclude: ["Le Sélect Bistro"] },
  { q: "vergnano", min: 1, first: "Eataly Toronto" },
  { q: "", f: { venue: "tea-matcha" }, min: 15, mustInclude: ["Machi Machi — Fairview Mall", "Neo Coffee Bar — Frederick"], mustExclude: ["Pilot Coffee Roasters — Yorkville", "Terroni — Queen West"] },
  { q: "", f: { venue: "restaurant-coffee" }, min: 15, mustInclude: ["Terroni — Queen West", "Café Diplomatico", "Dzô Viet Eatery"], mustExclude: ["Chatime — Bloor West"] },
  { q: "", f: { venue: "specialty-cafe" }, min: 50, mustExclude: ["Tsujiri", "Emmer"] },
  { q: "coffee", f: { venue: "tea-matcha" }, min: 1 },
  { q: "scarborough", f: { venue: "tea-matcha" }, min: 1, mustInclude: ["Presotea — Scarborough"] },
  // Phase 1 search: structured data only, attributes, typos, natural language.
  { q: "egg coffee", min: 3, mustInclude: ["Coffee Dak Lak", "+84 Café", "Dzô Viet Eatery"], mustExclude: ["Lady Marmalade"] },
  { q: "hojicha", min: 4, mustInclude: ["Little Pebbles", "Tsujiri"] },
  { q: "croissants", min: 8, mustInclude: ["Bonjour Brioche"], mustExclude: ["Athens Pastries"] },
  { q: "laptop friendly", min: 3, mustInclude: ["Quantum Coffee"] },
  { q: "outdoor seating", min: 3, mustInclude: ["Moonbean Coffee Company"] },
  { q: "matcha near kensington", min: 1, first: "Little Pebbles" },
  { q: "croisant", min: 8, mustInclude: ["Bonjour Brioche"] },
  { q: "matcah", min: 8, mustInclude: ["Tsujiri"] },
  { q: "kensingotn", min: 8, mustInclude: ["FIKA Cafe"] },
  { q: "", f: { drinks: ["egg-coffee"] }, min: 3, mustExclude: ["Lady Marmalade"] },
  { q: "", f: { drinks: ["matcha"], food: ["japanese-desserts"] }, min: 1, mustInclude: ["Tsujiri"] },
  { q: "", f: { amenities: ["laptop-friendly"] }, min: 3, mustExclude: ["Pilot Coffee Roasters — Yorkville"] },
  { q: "zzzz nothing", min: 0 },
  { q: "", f: { neighbourhoods: ["Kensington Market", "Chinatown"], types: ["Vietnamese Cafe"] }, min: 3, mustExclude: ["Rustle & Still"] },
  { q: "matcha", f: { neighbourhoods: ["Downtown"], types: ["Japanese Cafe"] }, min: 3 },
  { q: "", f: { neighbourhoods: ["Other"] }, min: 20, mustExclude: ["FIKA Cafe"] },
];

let failed = 0;
for (const c of cases) {
  const hits = applyFilters(index, { ...EMPTY_FILTERS, ...c.f, query: c.q });
  const names = hits.map((h) => h.cafe.name);
  const problems: string[] = [];
  if (names.length < c.min) problems.push(`expected ≥${c.min}, got ${names.length}`);
  if (c.min === 0 && names.length) problems.push(`expected none, got ${names.length}`);
  if (c.first && names[0] !== c.first) problems.push(`expected "${c.first}" first, got "${names[0]}"`);
  for (const n of c.mustInclude ?? []) if (!names.includes(n)) problems.push(`missing "${n}"`);
  for (const n of c.mustExclude ?? []) if (names.includes(n)) problems.push(`should not include "${n}"`);
  const label = `${JSON.stringify(c.q)}${c.f ? " + " + JSON.stringify(c.f) : ""}`;
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${label.padEnd(70)} ${String(names.length).padStart(3)}  ${names.slice(0, 4).join(" | ")}`);
  for (const p of problems) console.log(`       ↳ ${p}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed · ${cafes.length} cafes`);
process.exit(failed ? 1 : 0);
