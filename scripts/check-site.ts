/**
 * Cross-view consistency + smoke checks against a running site.   npm run check:site -- [baseUrl]
 * Pass --expect-live to also require that most cafés carry live Google hours and ratings (use it for production).
 * Default base URL is http://localhost:3000 (npm run start); pass https://toronto-coffee-guide.vercel.app for production.
 * Verifies that the home page, directory, map, API, sitemap and neighbourhood pages all report the same cafes,
 * that every café has a loadable detail page, and that no response is an error.
 */
const args = process.argv.slice(2);
const expectLive = args.includes("--expect-live");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label.padEnd(58)} ${detail}`);
};
const get = async (p: string) => {
  const r = await fetch(base + p, { redirect: "follow" });
  return { status: r.status, text: await r.text() };
};
const num = (text: string, re: RegExp) => {
  const m = text.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};
const strip = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");

async function main() {
  const api = JSON.parse((await get("/api/cafes?limit=200")).text) as { total: number; results: { slug: string; neighbourhood: string; cafe_categories: string[]; latitude: number | null; hours_source: string | null; google_rating: number | null }[] };
  const total = api.total;
  ok("API returns every café in one page", api.results.length === total, `${api.results.length}/${total}`);
  if (expectLive) {
    // Proves Google data actually shipped (hours and ratings), not just that pages render.
    const live = api.results.filter((c) => c.hours_source === "google").length;
    const rated = api.results.filter((c) => c.google_rating != null).length;
    ok("most cafes have live Google hours", live / total >= 0.85, `${live}/${total}`);
    ok("most cafes have a live Google rating", rated / total >= 0.85, `${rated}/${total}`);
  }
  ok("slugs are unique", new Set(api.results.map((c) => c.slug)).size === total);

  const home = strip((await get("/")).text);
  ok("home page total matches API", num(home, /Toronto, Ontario · (\d+) places/) === total, `home=${num(home, /Toronto, Ontario · (\d+) places/)} api=${total}`);

  const dir = strip((await get("/cafes")).text);
  const dirCount = num(dir, /Showing\s+(\d[\d,]*)\s+places/i);
  ok("directory count matches API", dirCount === total, `dir=${dirCount} api=${total}`);

  const sitemap = (await get("/sitemap.xml")).text;
  const siteCafes = [...sitemap.matchAll(/<loc>[^<]*\/cafes\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok("sitemap lists every café", siteCafes.length === total, `sitemap=${siteCafes.length} api=${total}`);
  ok("sitemap slugs equal API slugs", [...siteCafes].sort().join() === api.results.map((c) => c.slug).sort().join());

  const map = strip((await get("/map")).text);
  const mapCount = num(map, /(\d[\d,]*)\s+places/);
  ok("map count matches API", mapCount === total, `map=${mapCount} api=${total}`);

  // Neighbourhood pages: per-area counts add up to the total.
  const byHood = new Map<string, number>();
  for (const c of api.results) byHood.set(c.neighbourhood, (byHood.get(c.neighbourhood) ?? 0) + 1);
  ok("every café has a neighbourhood", [...byHood.keys()].every(Boolean), `${byHood.size} areas`);
  ok("neighbourhood counts sum to total", [...byHood.values()].reduce((a, b) => a + b, 0) === total);

  // Every detail page loads (in small batches).
  const slugs = api.results.map((c) => c.slug);
  let bad: string[] = [];
  for (let i = 0; i < slugs.length; i += 10) {
    const res = await Promise.all(slugs.slice(i, i + 10).map(async (s) => [s, (await get(`/cafes/${s}`)).status] as const));
    bad = bad.concat(res.filter(([, st]) => st !== 200).map(([s, st]) => `${s}:${st}`));
  }
  ok("every café detail page returns 200", bad.length === 0, bad.slice(0, 5).join(" "));

  for (const p of ["/about", "/categories", "/neighbourhoods", "/favourites", "/toronto/matcha-cafes"]) {
    const r = await get(p);
    ok(`direct route ${p}`, r.status === 200 || (p === "/toronto/matcha-cafes" && r.status === 404), String(r.status));
  }
  const missing = await get("/cafes/definitely-not-a-cafe");
  ok("unknown café → 404", missing.status === 404, String(missing.status));

  // Search spot checks through the same API.
  const q = async (s: string) => (JSON.parse((await get(`/api/cafes?q=${encodeURIComponent(s)}&limit=200`)).text) as { total: number }).total;
  for (const s of ["matcha", "vietnamese coffee", "egg coffee", "japanese desserts", "croissant", "laptop friendly", "kensington market matcha"]) {
    const n = await q(s);
    ok(`search "${s}" returns results`, n > 0, String(n));
  }

  console.log(`\n${failed ? `${failed} FAILED` : "all passed"} (${base}, ${total} cafés)`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
