#!/usr/bin/env node
/**
 * List cafes the site hides because Google reports them as closed.
 *
 *   npm run places:closed
 *
 * Calls Place Details (field mask: displayName,businessStatus) for every cafe with a placeId and prints
 * any that aren't OPERATIONAL. Read-only: nothing is written. CLOSED_PERMANENTLY cafes are the ones the
 * site hides; CLOSED_TEMPORARILY ones are still shown.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const file of [".env.local", ".env"]) {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) require("dotenv").config({ path: p, quiet: true });
}
const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

async function main() {
  if (!KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env.local");
    process.exit(1);
  }
  const cafes = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "cafes.seed.json"), "utf8")).filter((c) => c.placeId);
  console.log(`Checking ${cafes.length} cafes with a placeId…\n`);

  const rows = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < cafes.length) {
        const c = cafes[i++];
        const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(c.placeId)}`, {
          headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "displayName,businessStatus" },
        });
        if (!res.ok) {
          rows.push({ name: c.name, status: `ERROR HTTP ${res.status}`, google: "" });
          continue;
        }
        const p = await res.json();
        if (p.businessStatus !== "OPERATIONAL") rows.push({ name: c.name, status: p.businessStatus || "UNKNOWN", google: p.displayName?.text || "", placeId: c.placeId });
      }
    }),
  );

  const order = { CLOSED_PERMANENTLY: 0, CLOSED_TEMPORARILY: 1 };
  rows.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2) || a.name.localeCompare(b.name));
  if (!rows.length) return console.log("All cafes are OPERATIONAL.");
  for (const r of rows) {
    const note = r.status === "CLOSED_PERMANENTLY" ? "hidden on site" : "still shown";
    console.log(`${r.status.padEnd(20)} ${r.name}${r.google && r.google !== r.name ? `  (Google: ${r.google})` : ""}  · ${note}`);
    if (r.placeId) console.log(`${"".padEnd(20)} https://www.google.com/maps/place/?q=place_id:${r.placeId}`);
  }
  const hidden = rows.filter((r) => r.status === "CLOSED_PERMANENTLY").length;
  console.log(`\n${hidden} hidden as permanently closed · ${rows.length - hidden} other non-operational`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
