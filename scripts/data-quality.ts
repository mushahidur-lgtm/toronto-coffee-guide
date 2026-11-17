/**
 * Data quality report for data/cafes.seed.json → docs/data-quality-report.md
 *
 *   npx tsx scripts/data-quality.ts          # editorial checks only (free, offline)
 *   npx tsx scripts/data-quality.ts --live   # also asks Google Place Details for photos / hours / website / status
 *
 * --live makes one Place Details request per cafe with a Google place ID (on GOOGLE_PLACES_API_KEY), the same
 * request the site makes for every cafe once an hour. Nothing from Google is stored: only counts and yes/no flags
 * end up in the report.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import seed from "../data/cafes.seed.json";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { NEIGHBOURHOODS, regionOf } from "../src/lib/neighbourhoods";
import { isWorkFriendly } from "../src/lib/explorer";
import type { Cafe } from "../src/lib/types";

const ROOT = path.resolve(__dirname, "..");
for (const f of [".env.local", ".env"]) if (fs.existsSync(path.join(ROOT, f))) dotenv.config({ path: path.join(ROOT, f), quiet: true });
const LIVE = process.argv.includes("--live");
const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

const all: Cafe[] = (seed as Record<string, unknown>[]).map(normalizeCafe);
// Same rule as getCafeViews(): hidden when marked closed in the data, or (with --live) when Google says
// CLOSED_PERMANENTLY. Filled in main() once the live lookups are done.
let published: Cafe[] = [];
let closed: { cafe: Cafe; why: string }[] = [];
const hoodNames = new Set(NEIGHBOURHOODS.map((n) => n.name));

interface Live {
  status: string | null;
  photos: number;
  hours: boolean;
  website: boolean;
  location: boolean;
}

async function fetchLive(placeId: string): Promise<Live | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": "businessStatus,photos,regularOpeningHours,websiteUri,location" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { businessStatus?: string; photos?: unknown[]; regularOpeningHours?: { weekdayDescriptions?: string[] }; websiteUri?: string; location?: unknown };
  return {
    status: j.businessStatus ?? null,
    photos: j.photos?.length ?? 0,
    hours: !!j.regularOpeningHours?.weekdayDescriptions?.length,
    website: !!j.websiteUri,
    location: !!j.location,
  };
}

const validUrl = (u: string | null) => {
  if (!u) return true;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
};
const norm = (s: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  const live = new Map<string, Live | null>();
  if (LIVE) {
    if (!KEY) throw new Error("--live needs GOOGLE_PLACES_API_KEY in .env.local");
    const ids = all.filter((c) => c.google_place_id);
    for (let i = 0; i < ids.length; i += 8) {
      const batch = ids.slice(i, i + 8);
      const got = await Promise.all(batch.map((c) => fetchLive(c.google_place_id!)));
      batch.forEach((c, k) => live.set(c.id, got[k]));
      process.stderr.write(`\rlive ${Math.min(i + 8, ids.length)}/${ids.length}`);
    }
    process.stderr.write("\n");
  }
  for (const c of all) {
    if (c.verification_status === "closed") closed.push({ cafe: c, why: "marked closed in the data" });
    else if (live.get(c.id)?.status === "CLOSED_PERMANENTLY") closed.push({ cafe: c, why: "Google: permanently closed" });
    else published.push(c);
  }

  type Row = { cafe: Cafe; issues: string[] };
  const rows: Row[] = published.map((c) => {
    const issues: string[] = [];
    const L = live.get(c.id);
    if (!c.description || c.description.trim().length < 40) issues.push(c.description ? "short description" : "no description");
    if (!c.specialty_drinks.length && !c.food_offerings.length) issues.push("no menu highlights");
    else if (!c.specialty_drinks.length) issues.push("no drinks listed");
    if (!c.cafe_categories.length) issues.push("no category");
    if (!c.address && !c.google_place_id) issues.push("no address");
    if (!c.google_place_id) issues.push("no Google place ID (no live hours, photos or exact location)");
    if (!c.image_url && !c.google_place_id) issues.push("no photo source");
    if (LIVE && c.google_place_id) {
      if (!L) issues.push("Google lookup failed");
      else {
        if (L.photos === 0 && !c.image_url) issues.push("no photo on Google");
        if (!L.hours && !c.opening_hours?.length) issues.push("no opening hours");
        if (!L.location && c.latitude == null) issues.push("no coordinates");
        if (L.status && L.status !== "OPERATIONAL") issues.push(`Google status ${L.status}`);
      }
    }
    if (!validUrl(c.website_url)) issues.push("invalid website URL");
    if (!validUrl(c.instagram_url)) issues.push("invalid Instagram URL");
    if (!hoodNames.has(c.neighbourhood)) issues.push(`unknown neighbourhood "${c.neighbourhood}"`);
    if (c.has_wifi == null && c.has_patio == null && c.laptop_friendly == null && isWorkFriendly(c) == null) issues.push("amenities unverified");
    return { cafe: c, issues };
  });

  // Duplicates: same place ID, same normalised address, or same normalised name.
  const dupes: string[] = [];
  const group = (key: (c: Cafe) => string | null, label: string) => {
    const m = new Map<string, string[]>();
    for (const c of all) {
      const k = key(c);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), c.name]);
    }
    for (const [k, names] of m) if (names.length > 1) dupes.push(`${label} \`${k}\`: ${names.join(", ")}`);
  };
  group((c) => c.google_place_id, "Same place ID");
  group((c) => norm(c.name) || null, "Same name");
  group((c) => (c.address ? norm(c.address) : null), "Same address");

  const count = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const has = (s: string) => (r: Row) => r.issues.some((i) => i.startsWith(s));
  const byHood = new Map<string, number>();
  const byRegion = new Map<string, number>();
  for (const c of published) {
    byHood.set(c.neighbourhood, (byHood.get(c.neighbourhood) ?? 0) + 1);
    const r = regionOf(c.neighbourhood) ?? "Other";
    byRegion.set(r, (byRegion.get(r) ?? 0) + 1);
  }

  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  out.push(`# Data quality report`, ``, `Generated ${today} by \`npx tsx scripts/data-quality.ts${LIVE ? " --live" : ""}\`. Every count comes from \`data/cafes.seed.json\`, the same list the site reads.`, ``);
  out.push(`## Totals`, ``);
  out.push(`| | Count |`, `| --- | ---: |`);
  out.push(`| Records in the data file | ${all.length} |`);
  out.push(`| Published (shown on the site) | ${published.length} |`);
  out.push(`| Hidden as permanently closed | ${closed.length} |`);
  for (const r of ["Downtown", "West End", "East End", "Midtown", "North York", "Scarborough", "Etobicoke"]) out.push(`| ${r} | ${byRegion.get(r) ?? 0} |`);
  out.push(``);
  out.push(`## Coverage`, ``, `| Check | Cafes affected (of ${published.length}) |`, `| --- | ---: |`);
  out.push(`| No description | ${count(has("no description"))} |`);
  out.push(`| Short description (under 40 characters) | ${count(has("short description"))} |`);
  out.push(`| No menu highlights | ${count(has("no menu highlights"))} |`);
  out.push(`| Food but no drinks listed | ${count(has("no drinks listed"))} |`);
  out.push(`| No Google place ID | ${count(has("no Google place ID"))} |`);
  out.push(`| No photo source at all | ${count(has("no photo source"))} |`);
  if (LIVE) {
    out.push(`| No photo on Google | ${count(has("no photo on Google"))} |`);
    out.push(`| No opening hours | ${count(has("no opening hours"))} |`);
    out.push(`| No coordinates | ${count(has("no coordinates"))} |`);
    out.push(`| Google status not OPERATIONAL | ${count(has("Google status"))} |`);
    const withPhotos = published.filter((c) => c.image_url || (live.get(c.id)?.photos ?? 0) > 0).length;
    const withSite = published.filter((c) => c.website_url || live.get(c.id)?.website).length;
    out.push(`| **Have a genuine photo** (editorial or Google) | **${withPhotos}** |`);
    out.push(`| **Have a website** (editorial or Google) | **${withSite}** |`);
  }
  out.push(`| Invalid website or Instagram URL | ${count(has("invalid"))} |`);
  out.push(`| Neighbourhood not in the neighbourhood list | ${count(has("unknown neighbourhood"))} |`);
  out.push(`| No verified amenities (Wi-Fi, patio, laptop) | ${count(has("amenities unverified"))} |`);
  out.push(``);
  out.push(`Photos, hours and exact coordinates come live from Google Maps for cafes with a place ID; they are never stored. Amenities are only shown when a source states them, so "unverified" is expected for most cafes.`, ``);

  out.push(`## Duplicates`, ``, dupes.length ? dupes.map((d) => `- ${d}`).join("\n") : "None found (place ID, name or address).", ``);
  out.push(`## Hidden as closed`, ``, closed.length ? closed.map(({ cafe, why }) => `- ${cafe.name} (${cafe.neighbourhood}): ${why}`).join("\n") : "None.", ``);

  out.push(`## Cafes by neighbourhood`, ``, `| Neighbourhood | Region | Cafes |`, `| --- | --- | ---: |`);
  for (const [h, n] of [...byHood].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out.push(`| ${h} | ${regionOf(h) ?? "?"} | ${n} |`);
  out.push(``);

  const incomplete = rows.filter((r) => r.issues.some((i) => i !== "amenities unverified"));
  out.push(`## Listings needing work (${incomplete.length})`, ``, `Amenities-only gaps are left out of this list.`, ``, `| Cafe | Neighbourhood | Issues |`, `| --- | --- | --- |`);
  for (const r of incomplete.sort((a, b) => a.cafe.name.localeCompare(b.cafe.name))) {
    out.push(`| ${r.cafe.name} | ${r.cafe.neighbourhood} | ${r.issues.filter((i) => i !== "amenities unverified").join("; ")} |`);
  }
  out.push(``);

  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "docs", "data-quality-report.md"), out.join("\n"));
  console.log(`published ${published.length} · closed ${closed.length} · needing work ${incomplete.length} · duplicates ${dupes.length}`);
  console.log("wrote docs/data-quality-report.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
