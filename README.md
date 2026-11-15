# Toronto Coffee Guide

A minimalist, editorial-style directory of coffee shops and cafes across Toronto, with search across what each cafe actually serves: drinks, food, cuisine, category and neighbourhood.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Lucide icons · optional Supabase/PostgreSQL · Google Places API (New) · Vercel-ready.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # every variable is optional
npm run dev                  # http://localhost:3000
```

With no environment variables, the site runs entirely from `data/cafes.seed.json` (103 cafes) and shows neutral placeholders where a photo would be.

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:search` | Runs the spec's search examples and combined filters against the seed data (27 cases) |
| `npm run db:seed` | Upserts the seed file into Supabase (matched on `slug`) |
| `npm run places:sync` | Matches cafes to Google Place IDs and flags permanently closed businesses |

---

## Project structure

```
data/cafes.seed.json          Editorial cafe dataset (source of truth without a DB)
supabase/schema.sql           Postgres table, weighted full-text index, search_cafes() RPC, RLS
scripts/
  test-search.ts              Search regression tests
  seed-supabase.ts            JSON → Supabase upsert
  sync-google-places.ts       Place ID matching + business-status verification
src/lib/
  types.ts                    Cafe / CafeView / LivePlace types, cafe-type list
  data.ts                     Data access (Supabase → seed fallback) + live Google enrichment
  google-places.ts            Places API (New) client, server-only
  search.ts                   Search engine (shared by browser and /api/cafes)
  neighbourhoods.ts           Neighbourhoods, regions ("Downtown"), aliases, filter logic
  hours.ts, maps.ts           Hours grouping, Google Maps URL builders
src/components/               Header, CafeExplorer (search/filters/sort/load more), CafeCard,
                              CafePhoto (+ attribution), Hours, NeighbourhoodGrid, MapView
src/app/
  page.tsx                    Home: hero search, quick searches, featured, results, neighbourhoods
  cafes/(index)/              /cafes: full explorer + loading skeleton
  cafes/[slug]/               Cafe detail page (+ schema.org CafeOrCoffeeShop JSON-LD)
  neighbourhoods/, map/, about/
  api/cafes                   JSON search API: ?q=&n=&type=&sort=&limit=&offset=
  api/places/photo            Server-side Places photo resolver (API key never reaches the browser)
  sitemap.ts, robots.ts
```

---

## Search

Search is the core feature, and it is **not** a name filter. Each cafe is indexed across weighted fields:

| Field | Weight |
| --- | --- |
| Name | 10 |
| Neighbourhood + region + aliases (e.g. Kensington Market → "Downtown", "kensington") | 6 |
| Cafe categories (Specialty Coffee, Matcha Cafe, …) | 6 |
| Specialty drinks · food offerings · cuisine types | 5 |
| Tags (extra keywords such as "egg coffee", "roaster") | 3 |
| Description | 2 |
| Address | 1 |

How it behaves:

- Case- and accent-insensitive: `bánh mì` = `banh mi`, `Cộng Cà Phê` = `cong ca phe`.
- Partial matching at word starts, so results update as you type: `matc` → matcha, `vietnam` → Vietnamese.
- Light plural stemming: `croissants` → croissant, `bakeries` → bakery.
- Synonym concepts: `croissant` also finds pastries and viennoiserie; `vietnamese` finds cà phê, phin, bạc xỉu, egg and salt coffee; `japanese` finds matcha, hojicha, wagashi, soufflé pancakes; `korean` finds bingsu and croffles; `cold brew` finds nitro.
- Every concept in the query must match (AND); any synonym of a concept may match (OR). Filler words ("cafe", "near", "toronto") are ignored.
- Results are ranked by weighted score plus a whole-phrase bonus. Cards show **"Matches: Matcha latte"**, so it's clear why a cafe appeared.

The synonym table lives at the top of `src/lib/search.ts`. Extend it as the dataset grows.

**Filters** (neighbourhood multi-select, where "Downtown" means the whole region and "Other" means anything not listed; cafe type multi-select) combine with the search and with each other. **Sort:** best match, A–Z, Z–A, neighbourhood. The state lives in the URL (`/cafes?q=matcha&n=Downtown&type=Japanese%20Cafe`), so searches can be shared.

**Scaling:** with a few hundred cafes, searching in the browser is instant (the whole dataset is about 60 KB). Past roughly 1,000 cafes, switch `CafeExplorer` to call `/api/cafes` or the Postgres `search_cafes(q)` function in `supabase/schema.sql`, which uses a weighted `tsvector` (A–D weights mirroring the table above), prefix matching and trigram name matching.

---

## Data model

`supabase/schema.sql` creates `public.cafes`:

`id, name, slug, description, address, neighbourhood, latitude, longitude, website_url, google_maps_url, google_place_id, phone, instagram_url, image_url, image_credit, specialty_drinks[], food_offerings[], cuisine_types[], cafe_categories[], tags[], opening_hours[], featured, verification_status, source, created_at, updated_at`, plus a generated `search_vector`.

Arrays plus GIN indexes keep categories and specialties flexible without join tables. `opening_hours` uses Google's weekday format (`"Monday: 8:00 AM – 6:00 PM"`).

### Using Supabase

1. Create a project and run `supabase/schema.sql` in the SQL editor.
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Run `npm run db:seed`.

When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the site reads from the database, and falls back to the seed file if the database is unreachable. Pages revalidate hourly (ISR), so new rows appear without a redeploy.

---

## Adding cafes

**Without a database:** add an object to `data/cafes.seed.json`:

```json
{
  "name": "Example Coffee — Queen East",
  "neighbourhood": "Leslieville",
  "address": "123 Queen St E, Toronto, ON",
  "description": "One or two factual sentences.",
  "specialty_drinks": ["Espresso", "Matcha latte"],
  "food_offerings": ["Croissants"],
  "cuisine_types": [],
  "cafe_categories": ["Specialty Coffee", "Matcha Cafe"],
  "tags": ["roaster"],
  "website_url": "https://example.com",
  "instagram_url": null,
  "featured": false,
  "source": "URL or note on where the information came from"
}
```

Only `name` and `neighbourhood` are required. `slug`, `id`, timestamps and the Google Maps link are derived automatically. Use a neighbourhood name from `src/lib/neighbourhoods.ts`, or add a new one there with its region and centre point. Use the cafe types from `CAFE_TYPES` in `src/lib/types.ts` so filters pick them up. Then run `npm run test:search` and rebuild.

**With Supabase:** insert a row through the Supabase dashboard or SQL (same fields), or edit the JSON and run `npm run db:seed`. No frontend change is needed either way.

**Data rules:** never invent hours, menus, addresses or websites. Leave unknown fields `null` or `[]`, and the UI shows "Not available". Only use `image_url` for a photo you have the rights to that shows *that* cafe, never a stock photo.

---

## Google Maps Platform

1. In Google Cloud, enable **Places API (New)**. Create a server key restricted to that API and set it as `GOOGLE_MAPS_API_KEY`.
2. Run `npm run places:sync` (try `-- --dry-run` first). For each cafe it:
   - runs a Text Search (biased to Toronto) and accepts the result only if the name matches well. Weak matches are listed for manual review.
   - stores **only** `google_place_id` and a `verification_status` (`verified` if `OPERATIONAL`, `closed` if `CLOSED_PERMANENTLY`).
   - writes to Supabase if configured, otherwise back into `data/cafes.seed.json`.
3. At request time, `src/lib/data.ts` fetches Place Details for each cafe (address, hours, phone, website, Google Maps URL, coordinates, business status, photos) with a field mask, and caches them for `PLACES_REVALIDATE_SECONDS` (default 3600).
4. Photos go through `/api/places/photo`, which resolves the photo name with `skipHttpRedirect=true` and redirects to Google's short-lived URI. The image is never stored or re-hosted, and the API key never reaches the browser. Author attributions plus "Google Maps" are shown beside every photo, and pages say when hours come from Google Maps.
5. Optional: set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (HTTP-referrer restricted, Maps JavaScript API only) so `/map` shows exact pins on a Google map.

**Compliance notes**

- Google content is not persisted beyond the place ID, which Google exempts from its caching restrictions.
- Google-sourced coordinates are only drawn on a Google map. Without the browser key, `/map` uses Leaflet/OpenStreetMap with neighbourhood-level circles built from our own data.
- No scraping: all data comes from the official API or editorial research.
- Directions and place links use the documented Google Maps URLs format (`/maps/search/?api=1…`, `/maps/dir/?api=1…`).

**Cost:** one Place Details call per cafe per revalidation window, plus one photo call per displayed photo per hour. For 100 cafes that's about 2,400 detail calls a day at a 1-hour window. Raise `PLACES_REVALIDATE_SECONDS` to lower it.

---

## About the seed dataset

`data/cafes.seed.json` has **103 cafes in 34 neighbourhoods**, from downtown to North York, Scarborough and Etobicoke. It covers specialty roasters, neighbourhood cafes, Vietnamese, matcha, Japanese and Korean cafes, bakeries, dessert cafes, brunch spots and traditional Italian, Portuguese and Greek cafes.

- Each entry has a `source`: either a cited Toronto food guide URL, or `editorial` (curator knowledge).
- **Every cafe starts as `unverified`.** Run `npm run places:sync` with a Google key to confirm each business is open, and to automatically hide any Google reports as permanently closed. Some listings, especially 2023–2025 guide entries, may have closed since.
- **Opening hours are `null` in the seed on purpose.** They come live from Google once Place IDs are matched; until then the UI shows "Not available".
- Addresses are included only where the curator or a cited source was confident; otherwise they come from Google once matched.
- The 9 website URLs were checked: each returned HTTP 200 and its page title matched the business (Nov 2026).
- From the starter list in the brief: *The Library Specialty Coffee* is listed as **Library Coffee** (Queen West). *Cafe 23* was left out because its existence and location couldn't be confirmed; add it once you've verified it.

---

## Deployment (Vercel)

Import the repo into Vercel, add the environment variables from `.env.example`, and deploy. Set `NEXT_PUBLIC_SITE_URL` to the production URL for canonical links, the sitemap and structured data.

## Accessibility & performance

Semantic landmarks, a skip link, visible focus rings, keyboard-operable filters (native `<details>`, checkboxes and select; Esc closes popovers), `aria-live` result counts, AA-contrast greys, and reduced-motion support. Pages are statically generated with hourly ISR. Images are lazy-loaded with explicit dimensions, and Google photos are requested at the size actually displayed (640px for cards, 1600px for the hero).
