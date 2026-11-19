/**
 * Add map coordinates to cafes in data/cafes.seed.json from the City of Toronto's Address Points dataset
 * (open data, Open Government Licence – Toronto: commercial use allowed with attribution, may be stored).
 *
 *   npx tsx scripts/geocode.ts --dry-run     # show matches, write nothing
 *   npx tsx scripts/geocode.ts               # write latitude / longitude / location_source
 *   npx tsx scripts/geocode.ts --only <id>   # one cafe
 *
 * Only a cafe's own editorial `address` is looked up (street number + street name must both match one address
 * point exactly). Nothing comes from Google: Google addresses and coordinates may not be stored.
 * A cafe with no editorial address, or no matching point, gets no coordinates, and the map draws it as an
 * approximate (neighbourhood) marker instead of pretending to know where it is.
 *
 * Attribution to show wherever the map or coordinates appear:
 *   "Contains information licensed under the Open Government Licence – Toronto."
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { getNeighbourhood } from "../src/lib/neighbourhoods";
import { distanceKm } from "../src/lib/geo";

const SEED = path.resolve(__dirname, "..", "data", "cafes.seed.json");
const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search";
const RESOURCE = "0b3756af-9caf-4f0f-ac28-9c6617adede4"; // Address Points (Municipal) GeoJSON datastore
export const LOCATION_SOURCE = "City of Toronto Address Points (Open Government Licence – Toronto)";
const MAX_FROM_NEIGHBOURHOOD_KM = 9;

const TYPES: Record<string, string> = {
  road: "rd", street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", crescent: "cres", court: "crt", place: "pl", lane: "ln",
  terrace: "terr", square: "sq", gardens: "gdns", west: "w", east: "e", north: "n", south: "s",
};

/** "St. Clair Avenue West" and "St Clair Ave W" compare equal. */
export function normStreet(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => TYPES[t] ?? t)
    .join(" ");
}

/** "287 Augusta Ave, Toronto, ON" → { number: "287", street: "Augusta Ave" } (unit/suite parts are ignored). */
export function parseAddress(address: string | null): { number: string; street: string } | null {
  if (!address) return null;
  const first = address.split(",")[0].trim();
  const m = first.match(/^(\d+)\s+(.+)$/);
  return m ? { number: m[1], street: m[2].replace(/\s+(unit|suite|ste|#)\s*\S*$/i, "").trim() } : null;
}

interface Row {
  ADDRESS_NUMBER: string;
  LINEAR_NAME_FULL: string;
  ADDRESS_FULL: string;
  geometry: string | { type: string; coordinates: [number, number] };
}

const titleCase = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** The dataset writes streets like "Don Mills Rd" / "St Clair Ave W"; try that form, then the street as given. */
export function streetForms(street: string): string[] {
  return [...new Set([titleCase(normStreet(street)), titleCase(street.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().toLowerCase())])];
}

interface Row2 extends Row {
  LO_NUM: number | null;
  HI_NUM: number | null;
}

/** Address points on `street` for one number, or a list of numbers (to find the range a number falls in). */
async function lookup(number: string | string[], street: string): Promise<Row2[]> {
  const params = new URLSearchParams({ resource_id: RESOURCE, filters: JSON.stringify({ ADDRESS_NUMBER: number, LINEAR_NAME_FULL: street }), limit: "200" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${CKAN}?${params}`, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const j = (await res.json()) as { success: boolean; result: { records: Row2[] } };
      if (j.success) return j.result.records;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`lookup failed for ${number} ${street}`);
}

function coords(r: Row): { lat: number; lng: number } | null {
  const g = typeof r.geometry === "string" ? (JSON.parse(r.geometry) as { coordinates: [number, number] }) : r.geometry;
  const [lng, lat] = g.coordinates;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const raw = JSON.parse(fs.readFileSync(SEED, "utf8")) as Record<string, unknown>[];
  let matched = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const r of raw) {
    const cafe = normalizeCafe(r);
    if (only && cafe.id !== only) continue;
    if (cafe.verification_status === "closed") continue;
    const parsed = parseAddress(cafe.address);
    if (!parsed) {
      skipped++;
      continue;
    }
    const n = Number(parsed.number);
    let rows: Row2[] = [];
    for (const form of streetForms(parsed.street)) {
      rows = await lookup(parsed.number, form);
      await new Promise((res) => setTimeout(res, 120));
      if (!rows.length) {
        // Plazas and large buildings are often stored as a number range ("4700-4720 Yonge St"): accept a point
        // only when its own range contains the number, never "the nearest one".
        const near = await lookup(Array.from({ length: 41 }, (_, i) => String(n - 20 + i)).filter((x) => Number(x) > 0), form);
        rows = near.filter((x) => x.LO_NUM != null && x.LO_NUM <= n && n <= (x.HI_NUM ?? x.LO_NUM));
        await new Promise((res) => setTimeout(res, 120));
      }
      if (rows.length) break;
    }
    const hoodFor = getNeighbourhood(cafe.neighbourhood);
    let pts = rows.map(coords).filter((p): p is { lat: number; lng: number } => !!p);
    // The same number can exist in more than one municipality (Kensington Ave in Toronto and elsewhere): keep the
    // points near the cafe's neighbourhood.
    if (hoodFor && pts.length > 1) {
      const nearby = pts.filter((p) => distanceKm(p, hoodFor) <= MAX_FROM_NEIGHBOURHOOD_KM);
      if (nearby.length) pts = nearby;
    }
    if (!pts.length) {
      problems.push(`${cafe.name}: no address point for "${parsed.number} ${parsed.street}"`);
      continue;
    }
    // Several points can share an address (entrances, units): use their centre if they are close together.
    const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
    const lng = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
    const spread = Math.max(...pts.map((p) => distanceKm({ lat, lng }, p)));
    if (spread > 0.15) {
      problems.push(`${cafe.name}: ${pts.length} points for "${parsed.number} ${parsed.street}" spread ${Math.round(spread * 1000)} m, skipped`);
      continue;
    }
    const hood = getNeighbourhood(cafe.neighbourhood);
    if (hood && distanceKm({ lat, lng }, hood) > MAX_FROM_NEIGHBOURHOOD_KM) {
      problems.push(`${cafe.name}: match is ${distanceKm({ lat, lng }, hood).toFixed(1)} km from ${cafe.neighbourhood}, skipped`);
      continue;
    }
    matched++;
    if (!dry) {
      r.latitude = Math.round(lat * 1e6) / 1e6;
      r.longitude = Math.round(lng * 1e6) / 1e6;
      r.location_source = LOCATION_SOURCE;
    }
    console.log(`ok   ${cafe.name.padEnd(46)} ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }

  if (!dry) fs.writeFileSync(SEED, JSON.stringify(raw, null, 2) + "\n");
  console.log(`\n${matched} located · ${skipped} without an editorial address · ${problems.length} problem(s)${dry ? " (dry run)" : ""}`);
  for (const p of problems) console.log("PROBLEM", p);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
