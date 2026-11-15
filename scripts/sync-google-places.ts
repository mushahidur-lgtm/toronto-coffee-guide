/**
 * Match each cafe to its Google Place ID and check that it is still operating.
 *
 *   npm run places:sync               # match cafes that have no google_place_id yet
 *   npm run places:sync -- --all      # re-check every cafe (business status)
 *   npm run places:sync -- --dry-run  # print matches, write nothing
 *
 * Uses Places API (New) Text Search with a Toronto location bias. Following Google's terms, it stores
 * ONLY the place ID and our own verification status (verified / closed); never addresses, hours or photos,
 * which the site fetches live at request time.
 *
 * Writes back to data/cafes.seed.json, or to Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 * Matches with a weak name similarity are reported for manual review and not saved.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { normalize } from "../src/lib/search";

config({ path: ".env.local" });
config();

const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const ALL = args.has("--all");
const SEED = resolve(__dirname, "../data/cafes.seed.json");

interface Row {
  name: string;
  slug?: string;
  address?: string | null;
  neighbourhood: string;
  google_place_id?: string | null;
  placeId?: string;
  googleMapsUri?: string;
  verification_status?: string;
  last_verified?: string;
  [k: string]: unknown;
}

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  businessStatus?: string;
  types?: string[];
}

async function textSearch(query: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.types",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 5,
      regionCode: "CA",
      locationBias: { circle: { center: { latitude: 43.7, longitude: -79.42 }, radius: 30000 } },
    }),
  });
  if (!res.ok) throw new Error(`Text Search HTTP ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { places?: Place[] }).places ?? [];
}

async function details(placeId: string): Promise<Place | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": "id,displayName,formattedAddress,businessStatus" },
  });
  return res.ok ? ((await res.json()) as Place) : null;
}

/** Token overlap between our name (minus "— Location" suffix) and Google's display name. */
function similarity(a: string, b: string): number {
  const base = (s: string) => new Set(normalize(s.split(/\s[—–-]\s/)[0]).split(" ").filter((t) => t.length > 1 && !["the", "cafe", "coffee", "co"].includes(t)));
  const A = base(a);
  const B = base(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((t) => B.has(t) && hit++);
  return hit / Math.min(A.size, B.size);
}

/** Today in Toronto as YYYY-MM-DD. */
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!KEY) {
    console.error("Set GOOGLE_PLACES_API_KEY in .env.local (Places API (New) enabled).");
    process.exit(1);
  }
  const useDb = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = useDb ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) : null;

  let rows: Row[];
  if (db) {
    const { data, error } = await db.from("cafes").select("id,name,slug,address,neighbourhood,google_place_id,verification_status");
    if (error) throw error;
    rows = data as Row[];
  } else {
    rows = (JSON.parse(readFileSync(SEED, "utf8")) as Row[]).map((r) => ({ ...r, google_place_id: r.placeId ?? r.google_place_id ?? null }));
  }

  const review: string[] = [];
  let matched = 0;
  let closed = 0;

  for (const row of rows) {
    if (row.google_place_id && !ALL) continue;
    let place: Place | null = null;

    if (row.google_place_id) {
      place = await details(row.google_place_id);
    } else {
      const query = `${row.name.replace(/\s[—–]\s/, " ")}, ${row.address ?? row.neighbourhood + ", Toronto, ON"}`;
      const candidates = await textSearch(query);
      const best = candidates
        .map((p) => ({ p, s: similarity(row.name, p.displayName?.text ?? "") }))
        .sort((a, b) => b.s - a.s)[0];
      if (!best || best.s < 0.5) {
        review.push(`${row.name}  →  ${candidates.map((c) => `${c.displayName?.text} (${c.formattedAddress})`).join(" | ") || "no results"}`);
        await sleep(150);
        continue;
      }
      place = best.p;
    }
    if (!place) continue;

    const status = place.businessStatus === "CLOSED_PERMANENTLY" ? "closed" : place.businessStatus === "OPERATIONAL" ? "verified" : "unverified";
    if (status === "closed") closed++;
    matched++;
    console.log(`${status === "closed" ? "CLOSED " : "ok     "} ${row.name}  →  ${place.displayName?.text} · ${place.formattedAddress} [${place.id}]`);

    row.google_place_id = place.id;
    row.verification_status = status;
    // Only a definite answer from Google counts as a verification.
    if (status !== "unverified") row.last_verified = TODAY;
    if (db && !DRY) {
      const { error } = await db.from("cafes").update({ google_place_id: place.id, verification_status: status, ...(status !== "unverified" ? { last_verified: TODAY } : {}) }).eq("slug", row.slug as string);
      if (error) console.error(`  ↳ update failed: ${error.message}`);
    }
    await sleep(150);
  }

  if (!db && !DRY) {
    // The seed file stores the ID as camelCase `placeId`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const out = rows.map(({ google_place_id, ...r }) => (google_place_id ? { ...r, placeId: google_place_id } : r));
    writeFileSync(SEED, JSON.stringify(out, null, 2) + "\n");
  }

  console.log(`\nMatched ${matched} · permanently closed ${closed} · needs manual review ${review.length}${DRY ? " · DRY RUN, nothing written" : ""}`);
  if (review.length) {
    console.log("\nReview these (add google_place_id by hand, or fix the name/address and re-run):");
    for (const r of review) console.log(`  - ${r}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
