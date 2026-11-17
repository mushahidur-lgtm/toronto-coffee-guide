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
| `npm run places:sync` | Matches cafes to Google Place IDs, flags permanently closed businesses and stamps `last_verified` |
| `npm run places:closed` | Read-only report of cafes Google lists as closed (permanently closed ones are hidden on the site) |
| `npm run test:hours` | Tests the opening-hours parser and the "Open now" filter |

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
  suggest.ts                  Autocomplete suggestions (menu items, cafes, neighbourhoods)
  facets.ts                   Drink / food / amenity filters, matched against structured fields only
  collections.ts              Editorial collections (/toronto/<slug>), shown once 3+ cafes qualify
  favourites.ts               Favourites (localStorage, no account)
  menu.ts                     Menu sections + "You might also like" for cafe pages
  neighbourhoods.ts           Neighbourhoods, regions ("Downtown"), aliases, filter logic
  neighbourhood-intros.ts     Short intro paragraph per neighbourhood page
  hours.ts, maps.ts           Hours grouping, Google Maps URL builders
src/components/               Header, CafeExplorer (search/filters/sort/load more), CafeCard,
                              CafePhoto (+ attribution), PhotoGallery, CafeLocationMap,
                              FavouriteButton, Hours, NeighbourhoodGrid, map/
src/app/
  page.tsx                    Home: hero search, quick searches, collections, results
  cafes/(index)/              /cafes: full explorer + loading skeleton
  cafes/[slug]/               Cafe detail page (+ schema.org CafeOrCoffeeShop JSON-LD)
  neighbourhoods/, map/, about/, categories/, favourites/, toronto/[slug]/
  api/cafes                   JSON search API: ?q=&n=&type=&venue=&sort=&limit=&offset=
  api/place-photo             Live Google photo(s) + attribution, streamed with no-store (key stays server-side);
                              ?all=1 returns up to 6 photos for the cafe-page gallery
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
| Address | 1 |

Descriptions are deliberately **not** indexed: a cafe that merely mentions "croissant" in passing shouldn't show up for that search.

How it behaves:

- Case- and accent-insensitive: `bánh mì` = `banh mi`, `Cộng Cà Phê` = `cong ca phe`.
- Partial matching at word starts, so results update as you type: `matc` → matcha, `vietnam` → Vietnamese.
- Light plural stemming: `croissants` → croissant, `bakeries` → bakery.
- Synonym concepts: `croissant` also finds viennoiserie and croffles; `vietnamese` finds cà phê, phin, bạc xỉu, egg and salt coffee; `japanese` finds matcha, hojicha, wagashi, soufflé pancakes; `korean` finds bingsu and croffles; `cold brew` finds nitro; `laptop friendly`, `wifi`, `patio`, `late night` and `quiet` map to the matching attributes.
- Short and known words match whole words only, so `chai` doesn't match "chain".
- Typo tolerance: unknown words are corrected against the indexed vocabulary (`matcah` → matcha, `croisant` → croissant).
- Every concept in the query must match (AND); any synonym of a concept may match (OR). Filler words ("cafe", "near", "toronto") are ignored. Multi-word phrases such as `egg coffee` prefer exact-phrase matches.
- If nothing matches every word, a "close matches" fallback shows cafes matching most of them, with a notice.
- Results are ranked by weighted score plus a whole-phrase bonus. Cards show **"Matches: Matcha latte"**, so it's clear why a cafe appeared.
- **Autocomplete** (`src/lib/suggest.ts`) suggests menu items, cafes and neighbourhoods as you type; arrow keys and Enter work.

The synonym table lives at the top of `src/lib/search.ts`. Extend it as the dataset grows.

**Filters** (neighbourhood multi-select, where "Downtown" means the whole region and "Other" means anything not listed; cafe type multi-select; venue type; **Drinks**, **Food** and **Amenities** from `src/lib/facets.ts`; **Open now**) combine with the search and with each other. Facet options match structured fields only (menu items, categories, verified attributes) and an option with no supporting cafe is hidden, which is why there's no atmosphere or price filter yet: the data doesn't exist. URL params: `d=matcha,cold-brew`, `f=croissants`, `a=wifi`. On mobile the filters open in a full-screen drawer. **Sort:** best match, A–Z, Z–A, neighbourhood, **Near me**. The state lives in the URL (`/cafes?q=matcha&n=Downtown&type=Japanese%20Cafe&open=1`), so searches can be shared, and `/cafes` renders that URL on the server, so search links and the search form work without JavaScript.

- **Open now** parses each cafe's hours (Google's weekday format, including split shifts and hours past midnight) against the current time in Toronto. Cafes with unknown hours are left out while it's on.
- **Near me** asks for the visitor's location only when they pick it, sorts by distance using the cafe's editorial coordinates or its live Google location, and lists cafes without a location last. The location stays in the browser and is never put in the URL. If permission is denied, the order doesn't change.

**Scaling:** with a few hundred cafes, searching in the browser is instant (the whole dataset is about 60 KB). Past roughly 1,000 cafes, switch `CafeExplorer` to call `/api/cafes` or the Postgres `search_cafes(q)` function in `supabase/schema.sql`, which uses a weighted `tsvector` (A–D weights mirroring the table above), prefix matching and trigram name matching.

---

## Discovery features

- **Collections** (`src/lib/collections.ts`): themed lists such as *Best Matcha in Toronto* and *Work-Friendly Cafes*, each with its own `/toronto/<slug>` page and a card on the homepage and `/categories`. Membership comes from structured data. Lists that need human judgement (*Hidden Gems*, *Beautiful Cafes*) use the cafe's editorial `collections` field, e.g. `"collections": ["hidden-gems"]`. A collection appears only once 3 or more cafes qualify; until then its page returns 404 and it's left out of the sitemap.
- **Favourites:** the heart on cards and cafe pages saves to `localStorage` (`tcg:favourites`), with no account. The header shows the count, and `/favourites` lists them.
- **Cafe pages:**
  - The menu is grouped into *Coffee*, *Matcha & tea*, *Specialty drinks* and *Food & pastries*.
  - Only verified amenities are shown, and unknown ones are listed as "Not yet verified".
  - Live Google rating and today's hours.
  - A photo gallery: up to 5 more Google photos, loaded when the section scrolls into view, each credited, with a keyboard-friendly lightbox.
  - A location map: a Google pin with the browser key, otherwise OpenStreetMap with our own coordinates, or the neighbourhood as an approximate area.
  - "You might also like", scored on neighbourhood, venue type, shared menu specialties and categories.
- **Neighbourhood pages:**
  - A short intro (`src/lib/neighbourhood-intros.ts`).
  - "Popular here" chips that link to the filtered explorer.
  - Cafe photos and an area map.
  - A "View on the map" link (`/map?n=<name>`).
  - Links to other neighbourhoods in the same region.
  - Neighbourhoods with no listed cafes return 404.

---

## Data model

`supabase/schema.sql` creates `public.cafes`:

`id, name, slug, description, address, neighbourhood, latitude, longitude, website_url, google_maps_url, google_place_id, phone, instagram_url, image_url, image_credit, specialty_drinks[], food_offerings[], cuisine_types[], cafe_categories[], tags[], opening_hours[], featured, verification_status, last_verified, source, created_at, updated_at`, plus a generated `search_vector`.

`last_verified` (a date) is set by `npm run places:sync` when Google confirms a business status, or by hand when you check a listing yourself. Cafe pages then show "Last verified November 2026". For an existing database, the end of `schema.sql` has an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` you can run again safely.

Every count on the site (home, neighbourhoods, About, sitemap) comes from the same list, which hides cafes Google reports as permanently closed. Run `npm run places:closed` to see which ones those are.

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

### Adding your own photo

Use this for a cafe with no Google match or no photos on Google Maps. An own photo always takes priority over Google's.

1. Save a landscape JPG, about 1600px wide and under ~300 KB, as `public/images/cafes/<slug>.jpg`. The slug is the last part of the cafe's URL, e.g. `/cafes/cong-ca-phe-yonge-street` → `public/images/cafes/cong-ca-phe-yonge-street.jpg`.
2. Add two fields to that cafe in `data/cafes.seed.json`:
   ```json
   "image_url": "/images/cafes/cong-ca-phe-yonge-street.jpg",
   "image_credit": "Your Name"
   ```
   `image_credit` appears as "Photo: Your Name" under the image. With Supabase, set the same two columns on the row.
3. Commit the image and the JSON change, then push. Vercel redeploys automatically.

`image_url` may also be a full `https://` link, but the Content-Security-Policy only allows images from this site and Google's hosts. Images hosted anywhere else need their host added to `img-src` in `next.config.ts`, so keeping them in `public/images/cafes/` is simplest.

Don't add a photo for a cafe that's permanently closed. Mark it `"verification_status": "closed"` instead, and the site hides it.

---

## Google Maps Platform

1. In Google Cloud, enable **Places API (New)**. Create a server key restricted to that API and set it in `.env.local` as `GOOGLE_PLACES_API_KEY` (the older name `GOOGLE_MAPS_API_KEY` also works).
2. **One-time Place ID lookup:** run `npm run places:ids` (or `node scripts/populate-place-ids.js`). Add `-- --dry-run` to preview, or `-- --limit 5` for a small first test. It searches `"<name> <address or neighbourhood> Toronto"` with the field mask `places.id,places.displayName,places.googleMapsUri`. Confident matches are saved as `placeId` and `googleMapsUri` in `data/cafes.seed.json`; cafes with no, weak, ambiguous or duplicate matches are printed and written to `data/place-id-review.json` (git-ignored) so you can fix them by hand. Cafes that already have a `placeId` are skipped unless you pass `--force`.

   Alternatively, run `npm run places:sync` (try `-- --dry-run` first), which also checks whether each business is still open. For each cafe it:
   - runs a Text Search (biased to Toronto) and accepts the result only if the name matches well. Weak matches are listed for manual review.
   - stores **only** `google_place_id` and a `verification_status` (`verified` if `OPERATIONAL`, `closed` if `CLOSED_PERMANENTLY`).
   - writes to Supabase if configured, otherwise back into `data/cafes.seed.json`.
3. At request time, `src/lib/data.ts` fetches Place Details for each cafe (address, hours, phone, website, Google Maps URL, coordinates, business status, photos) with a field mask, and caches them for `PLACES_REVALIDATE_SECONDS` (default 3600).
4. **Photos load live and are never cached.** A cafe card asks `/api/place-photo?placeId=…` for a photo only when it scrolls near the viewport (IntersectionObserver); above-the-fold images load straight away. The route:
   - only serves place IDs that belong to a listed cafe, so nobody else can spend your quota through it;
   - calls Place Details with the field mask `photos,googleMapsUri` and returns `{ photo: { imageUrl, authorName, authorUri }, googleMapsUri }`;
   - streams the image bytes from Google's `…/media` endpoint when `imageUrl` is requested;
   - sends `Cache-Control: no-store` (plus `CDN-Cache-Control` and `Vercel-CDN-Cache-Control`) on every response and uses `cache: "no-store"` on every Google call, so nothing is stored on the CDN or disk;
   - returns 429 when Google's quota is reached, 404 for unknown places and 503 without a key. The card then shows the neutral placeholder.

   Every Google photo has "Photo by [author]" (linked to the author's profile) and "Google Maps" (linked to the place) underneath it. An editorial `image_url` always takes priority over Google.
5. Optional: set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (HTTP-referrer restricted, Maps JavaScript API only) so `/map` shows exact pins on a Google map.

**Compliance notes**

- Google content is not persisted beyond the place ID, which Google exempts from its caching restrictions.
- Google-sourced coordinates are only drawn on a Google map. Without the browser key, `/map` uses Leaflet/OpenStreetMap with neighbourhood-level circles built from our own data.
- No scraping: all data comes from the official API or editorial research.
- Directions and place links use the documented Google Maps URLs format (`/maps/search/?api=1…`, `/maps/dir/?api=1…`).

**Cost:** one Place Details call per cafe per revalidation window, plus two photo calls (Place Details + media) each time a visitor scrolls a card into view. Photos are deliberately uncached, so every view costs a request. For 100 cafes that's about 2,400 detail calls a day at a 1-hour window. Raise `PLACES_REVALIDATE_SECONDS` to lower it.

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

Import the repo into Vercel, add the environment variables from `.env.example`, and deploy. Set `NEXT_PUBLIC_SITE_URL` to the production URL (your custom domain, if you have one) for canonical links, the sitemap, Open Graph images and structured data. Without it the site falls back to Vercel's production domain (`VERCEL_PROJECT_PRODUCTION_URL`), then to localhost.

## Map explorer (`/map`)

A split view on desktop (map on the left, cafe list on the right) and a full-screen map with a draggable bottom sheet on mobile.

- **Quick filters:** search, Area, Type, plus a scrollable row of pills: *Open now*, *Laptop friendly*, *Patio* and eight Toronto categories (*Third-Wave & Roasters*, *Italian Espresso Bars*, *Asian-Inspired & Matcha*, *Bakery-Cafes*, *Work & Study*, *Multi-Concept & Hybrid*, *Grab-and-Go*, *Chains*).
- **List ↔ map sync:** hovering a card highlights its pin (or a stand-in pin when it's inside a cluster). Clicking a card pans and zooms to it and opens its card. Clicking a pin opens the card and scrolls the list to it.
- **Clustering:** `@googlemaps/markerclusterer`; clusters split from zoom 15 or when clicked.
- **Search this area:** after the user pans or zooms well away from the last searched or fitted area, a pill appears that limits results to the visible map.
- **URL state:** `?q=&n=&type=&open=1&category=third-wave,bakery&laptop=1&patio=1&bbox=s,w,n,e&selected=<slug>&lat=&lng=&zoom=`. Filters and selection add history entries, so Back and Forward work; map moves replace the current entry. The old `?cafe=<slug>` links still work.
- **Google vs Leaflet:** with `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and `NEXT_PUBLIC_GOOGLE_MAP_ID` you get exact pins. Without them, a Leaflet/OSM fallback groups cafes by neighbourhood, because Google coordinates can't go on a non-Google map. In that mode "Search this area" uses neighbourhood centres.

**Categories and attributes** come from `src/lib/explorer.ts`. They're derived from existing data (cafe types, cuisines, tags) and never guessed. To set them by hand, add any of these to a cafe in the seed file or database:

```json
"explorer_categories": ["third-wave", "work-study"],
"has_wifi": true,
"has_patio": true,
"roasts_in_house": true,
"laptop_friendly": true,
"is_chain": false
```

Leave a field out when you don't know it; unknown values never match a filter. *Patio* also uses Google's live `outdoorSeating`, which is requested in Place Details and never stored. That field bills Place Details at the Atmosphere tier; set `PLACES_ATMOSPHERE_FIELDS=false` to skip it. The Supabase columns are added at the end of `supabase/schema.sql`.

## Security

- **Photo route:** `/api/place-photo` only serves place IDs from the cafe list, snaps `w` to 400, 800 or 1200, and is rate limited per IP through Upstash Redis (120/min and 2000/day by default; set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). Without Redis there is no rate limit, so set it up before launch.
- **Headers:** `next.config.ts` sends a Content-Security-Policy plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` (geolocation is allowed for this site only). The CSP allows Google Maps and OpenStreetMap for `/map`. If you add an editorial `image_url` hosted somewhere new, add that host to `img-src`, or put the image in `/public`.
- **Untrusted data:** JSON-LD is escaped with `serializeJsonLd()`. Map popup HTML escapes names and URL-encodes slugs. `normalizeCafe` accepts only http(s) URLs (plus site-relative image paths) and re-slugifies every slug.
- **`/api/cafes`:** `q` is capped at 200 characters, `n` and `type` at 20 items, `limit` at 1–200, and `sort` must be a known value.
- **Google Cloud:** set a daily quota cap and a budget alert on Places API (New). Restrict the server key to Places API (New), and restrict `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` by HTTP referrer to your domains.

## Accessibility & performance

Semantic landmarks, a skip link, visible focus rings, keyboard-operable filters (native `<details>`, checkboxes and select; Esc closes popovers), `aria-live` result counts, AA-contrast greys, and reduced-motion support. Pages are statically generated with hourly ISR. Images are lazy-loaded with explicit dimensions, and Google photos are only requested once a card nears the viewport, at the size displayed (800px for cards, 1600px for the hero).
