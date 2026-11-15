#!/usr/bin/env node
/**
 * One-time: find the Google Place ID and Google Maps link for every cafe in data/cafes.seed.json.
 *
 *   node scripts/populate-place-ids.js              # fill cafes that have no placeId yet
 *   node scripts/populate-place-ids.js --dry-run    # show what would be saved, write nothing
 *   node scripts/populate-place-ids.js --limit 5    # only process the first 5 (good first test)
 *   node scripts/populate-place-ids.js --force      # re-query cafes that already have a placeId
 *
 * Needs GOOGLE_PLACES_API_KEY in .env.local (Places API (New) enabled on the key).
 *
 * For each cafe it calls Places API (New) Text Search with
 *   "<cafe name> <address or neighbourhood> Toronto"
 * requesting only places.id, places.displayName and places.googleMapsUri (keeps cost on the lowest tier).
 *
 * A result is saved only when it's a confident match. Everything else goes to the review list
 * (printed at the end and written to data/place-id-review.json):
 *   - no_results  Google returned nothing
 *   - weak        nothing returned has a name close to ours
 *   - ambiguous   several results look like this cafe (e.g. a chain, and we have no street address),
 *                 or the best-looking result isn't Google's top result
 *   - duplicate   the matched place was already assigned to another cafe
 * To fix one by hand: open the candidate's Google Maps link, then paste the right "placeId" and
 * "googleMapsUri" into that cafe's entry in data/cafes.seed.json.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SEED = path.join(ROOT, "data", "cafes.seed.json");
const REVIEW = path.join(ROOT, "data", "place-id-review.json");

// ---- env -------------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) require("dotenv").config({ path: p, quiet: true });
}
const KEY = process.env.GOOGLE_PLACES_API_KEY;

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
const limitIdx = argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) || Infinity : Infinity;

// ---- matching helpers ------------------------------------------------------
const STOP = new Set(["the", "cafe", "caf", "coffee", "co", "company", "and", "bar", "toronto", "inc", "ltd"]);
const tokens = (s) =>
  new Set(
    String(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );

/** "Jimmy's Coffee — Portland" → "Jimmy's Coffee" (brand part used for name matching). */
const brand = (name) => name.split(/\s+[—–]\s+/)[0];

/** Share of our brand-name words that appear in Google's name (0–1). */
function similarity(ourName, googleName) {
  const ours = tokens(brand(ourName));
  const theirs = tokens(googleName);
  if (!ours.size) return 0;
  let hit = 0;
  for (const t of ours) if (theirs.has(t)) hit++;
  return hit / ours.size;
}

const STRONG = 0.6;

// ---- API -------------------------------------------------------------------
async function textSearch(textQuery) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 5,
      regionCode: "CA",
      languageCode: "en",
      // Bias (not restrict) to the City of Toronto.
      locationBias: { circle: { center: { latitude: 43.7, longitude: -79.42 }, radius: 30000 } },
    }),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return (body.places || []).map((p) => ({
    id: p.id,
    name: (p.displayName && p.displayName.text) || "",
    googleMapsUri: p.googleMapsUri || null,
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- main ------------------------------------------------------------------
async function main() {
  if (!KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY. Add it to .env.local:\n\n  GOOGLE_PLACES_API_KEY=your-key\n");
    process.exit(1);
  }

  const cafes = JSON.parse(fs.readFileSync(SEED, "utf8"));
  const takenBy = new Map(cafes.filter((c) => c.placeId).map((c) => [c.placeId, c.name]));
  const todo = cafes.filter((c) => FORCE || !c.placeId).slice(0, LIMIT);

  console.log(`${cafes.length} cafes · ${todo.length} to look up${DRY ? " · DRY RUN" : ""}\n`);

  const review = [];
  let saved = 0;
  let unsaved = 0;

  const save = () => {
    if (DRY || unsaved === 0) return;
    fs.writeFileSync(SEED, JSON.stringify(cafes, null, 2) + "\n");
    unsaved = 0;
  };
  process.on("SIGINT", () => {
    save();
    console.log("\nInterrupted. Progress so far has been saved.");
    process.exit(130);
  });

  for (const [i, cafe] of todo.entries()) {
    const where = cafe.address ? cafe.address.replace(/,?\s*Toronto,?\s*ON\s*$/i, "") : cafe.neighbourhood;
    const query = `${cafe.name.replace(/\s+[—–]\s+/g, " ")} ${where} Toronto`;
    const tag = `[${String(i + 1).padStart(3)}/${todo.length}]`;

    let results;
    try {
      results = await textSearch(query);
    } catch (err) {
      if (err.status === 400 || err.status === 401 || err.status === 403) {
        save();
        console.error(`\n${tag} ${cafe.name}: ${err.message}\n\nStopping: check that the key is valid and "Places API (New)" is enabled for it.`);
        process.exit(1);
      }
      console.log(`${tag} ERROR      ${cafe.name}: ${err.message}`);
      review.push({ name: cafe.name, reason: "error", query, detail: err.message, candidates: [] });
      await sleep(1000);
      continue;
    }

    const scored = results.map((r, idx) => ({ ...r, idx, score: similarity(cafe.name, r.name) }));
    const strong = scored.filter((r) => r.score >= STRONG);
    const top = scored[0];
    const candidates = scored.map(({ id, name, googleMapsUri, score }) => ({ id, name, googleMapsUri, score: Math.round(score * 100) / 100 }));

    let reason = null;
    if (!scored.length) reason = "no_results";
    else if (!strong.length) reason = "weak";
    else if (top.score < STRONG) reason = "ambiguous"; // a good name match exists, but not as Google's top result
    else if (strong.length > 1 && !cafe.address) reason = "ambiguous"; // e.g. several locations of a chain
    else if (takenBy.has(top.id) && takenBy.get(top.id) !== cafe.name) reason = "duplicate";

    if (reason) {
      const extra = reason === "duplicate" ? ` (already used by "${takenBy.get(top.id)}")` : "";
      console.log(`${tag} ${reason.toUpperCase().padEnd(10)} ${cafe.name}${extra}  →  ${candidates.map((c) => c.name).join(" | ") || "—"}`);
      review.push({ name: cafe.name, reason, query, candidates });
    } else {
      console.log(`${tag} OK         ${cafe.name}  →  ${top.name}`);
      if (cafe.placeId && cafe.placeId !== top.id) takenBy.delete(cafe.placeId);
      cafe.placeId = top.id;
      if (top.googleMapsUri) cafe.googleMapsUri = top.googleMapsUri;
      takenBy.set(top.id, cafe.name);
      saved++;
      unsaved++;
      if (unsaved >= 10) save();
    }
    await sleep(120);
  }

  save();
  if (!DRY) fs.writeFileSync(REVIEW, JSON.stringify(review, null, 2) + "\n");

  console.log(`\nSaved ${saved} · need manual review ${review.length}${DRY ? " · DRY RUN, nothing written" : ""}`);
  if (review.length) {
    console.log("\nCheck these by hand (candidates are Google's top results for each query):");
    for (const r of review) {
      console.log(`\n  ${r.name}  [${r.reason}]\n    query: ${r.query}`);
      for (const c of r.candidates) console.log(`    - ${c.name} (name match ${Math.round(c.score * 100)}%)  ${c.googleMapsUri || ""}  id=${c.id}`);
    }
    if (!DRY) console.log(`\nFull list written to ${path.relative(ROOT, REVIEW)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
