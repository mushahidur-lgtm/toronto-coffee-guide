#!/usr/bin/env node
/**
 * Find the Google Place ID and Google Maps link for cafes in data/cafes.seed.json.
 *
 *   node scripts/populate-place-ids.js              # cafes that have no placeId yet
 *   node scripts/populate-place-ids.js --dry-run    # show proposed matches, write nothing
 *   node scripts/populate-place-ids.js --limit 5    # only the first 5
 *   node scripts/populate-place-ids.js --force      # re-check cafes that already have a placeId
 *
 * Needs GOOGLE_PLACES_API_KEY in .env.local (Places API (New) enabled on the key).
 *
 * How a cafe is matched
 *  - Names like "Cộng Cà Phê — Yonge Street" are split into brand + branch. The Text Search query is
 *    "<brand> <branch> <street address or neighbourhood> Toronto, ON", biased to the City of Toronto, with
 *    includedType "cafe" (bakeries and dessert shops search without a type; if "cafe" finds nothing
 *    useful, it retries without a type).
 *  - Each result is scored on: brand name match (accent- and spacing-insensitive, ignoring generic words
 *    like "coffee", "roasters", "bakery"), our street address appearing in Google's address, the branch
 *    name appearing in Google's name or address, and distance from the cafe's neighbourhood.
 *  - With several brand matches (chains), the one with the strongest location evidence wins, but only
 *    if it clearly beats the runner-up. Otherwise the cafe goes to review.
 *
 * What is written (never with --dry-run)
 *  - placeId and googleMapsUri only. formattedAddress, location and businessStatus are requested
 *    solely to decide the match and are NOT stored (Google Maps Platform terms).
 *  - A cafe Google reports as CLOSED_PERMANENTLY gets verification_status "closed" (our own flag),
 *    so the site hides it instead of showing a photo.
 *
 * Anything uncertain goes to data/place-id-review.json (git-ignored) with its top 3 candidates
 * (name, address, Maps link, place ID). To fix one by hand, copy the right "placeId" and
 * "googleMapsUri" into that cafe's entry in data/cafes.seed.json, then delete the review file.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SEED = path.join(ROOT, "data", "cafes.seed.json");
const REVIEW = path.join(ROOT, "data", "place-id-review.json");

// ---- env & args -------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) require("dotenv").config({ path: p, quiet: true });
}
const KEY = process.env.GOOGLE_PLACES_API_KEY;
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
const limitIdx = argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) || Infinity : Infinity;

// ---- neighbourhood centres (read from src/lib/neighbourhoods.ts so there's one source) ----
const HOODS = new Map();
{
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "neighbourhoods.ts"), "utf8");
  for (const m of src.matchAll(/name: "([^"]+)",[^}]*?lat: (-?[\d.]+), lng: (-?[\d.]+)/g)) {
    HOODS.set(m[1], { lat: Number(m[2]), lng: Number(m[3]) });
  }
}

// City of Toronto, roughly (Etobicoke to Scarborough, lakeshore to Steeles).
const TORONTO_RECT = { low: { latitude: 43.58, longitude: -79.64 }, high: { latitude: 43.86, longitude: -79.11 } };

// ---- text helpers -------------------------------------------------------------
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Words that don't identify a business. */
const GENERIC = new Set([
  "the", "and", "cafe", "caf", "coffee", "co", "company", "roasters", "roastery", "bar", "bakery", "bakeshop",
  "patisserie", "dessert", "desserts", "kafe", "espresso", "tea", "house", "toronto", "inc", "ltd", "shop",
]);
const brandTokens = (s) => norm(s).split(" ").filter((t) => t.length > 1 && !GENERIC.has(t));
const compact = (s) => norm(s).replace(/ /g, "");

/** Split "Cộng Cà Phê — Yonge Street" → { brand: "Cộng Cà Phê", branch: "Yonge Street" }. */
function splitName(name) {
  const [brand, ...rest] = name.split(/\s+[—–]\s+/);
  return { brand: brand.trim(), branch: rest.join(" ").trim() || null };
}

/** 0–1: how much of our brand Google's name contains (spacing-insensitive: "Cong Caphe" ≈ "Cộng Cà Phê"). */
function nameScore(brand, googleName) {
  const ours = brandTokens(brand);
  const theirWords = new Set(brandTokens(googleName));
  const theirs = compact(googleName);
  if (!ours.length) return compact(brand) && theirs.includes(compact(brand)) ? 1 : 0;
  // Whole brand with spacing ignored ("Cong Caphe" = "Cộng Cà Phê"), but only for multi-word brands,
  // so a one-word brand can't match inside another word ("machi" inside "zagmachi").
  if (ours.length > 1 && theirs.includes(ours.join(""))) return 1;
  return ours.filter((t) => theirWords.has(t)).length / ours.length;
}

/** Does Google's address contain our street address (number + first street word)? */
function addressMatches(ourAddress, googleAddress) {
  if (!ourAddress || !googleAddress) return false;
  const m = norm(ourAddress).match(/^(\d+[a-z]?)\s+([a-z0-9]+)/);
  if (!m) return false;
  const g = ` ${norm(googleAddress)} `;
  return g.includes(` ${m[1]} ${m[2]}`);
}

/** Do the branch's distinctive words appear in Google's name or address? ("Yonge Street" → "yonge") */
function branchMatches(branch, googleName, googleAddress) {
  if (!branch) return false;
  const words = norm(branch)
    .split(" ")
    .filter((t) => t.length > 2 && !["street", "st", "avenue", "ave", "road", "rd", "the", "village", "district"].includes(t));
  if (!words.length) return false;
  const hay = ` ${norm(googleName)} ${norm(googleAddress)} `;
  return words.every((w) => hay.includes(` ${w}`));
}

function km(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---- API ----------------------------------------------------------------------
const FIELD_MASK = "places.id,places.displayName,places.googleMapsUri,places.formattedAddress,places.location,places.businessStatus";

async function textSearch(textQuery, includedType) {
  const body = {
    textQuery,
    maxResultCount: 5,
    regionCode: "CA",
    languageCode: "en",
    locationBias: { rectangle: TORONTO_RECT },
  };
  if (includedType) body.includedType = includedType;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return (json.places || []).map((p) => ({
    id: p.id,
    name: (p.displayName && p.displayName.text) || "",
    address: p.formattedAddress || "",
    googleMapsUri: p.googleMapsUri || null,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
    businessStatus: p.businessStatus || null,
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Score candidates and pick one, or explain why not. */
function decide(cafe, results) {
  const { brand, branch } = splitName(cafe.name);
  const centre = HOODS.get(cafe.neighbourhood) || null;
  const scored = results.map((r, idx) => {
    const name = nameScore(brand, r.name);
    const addr = addressMatches(cafe.address, r.address);
    const br = branchMatches(branch, r.name, r.address);
    const dist = centre && r.location ? km(centre, r.location) : null;
    // Location evidence: our street address > branch name > being in/near the neighbourhood.
    let evidence = 0;
    if (addr) evidence += 4;
    if (br) evidence += 3;
    if (dist != null) evidence += dist <= 1.2 ? 2 : dist <= 2.5 ? 1 : dist > 6 ? -2 : 0;
    return { ...r, idx, name_score: name, addr, branch: br, dist, evidence };
  });
  const brandMatches = scored.filter((s) => s.name_score >= 0.6).sort((a, b) => b.evidence - a.evidence || a.idx - b.idx);

  if (!scored.length) return { reason: "no_results", scored };
  if (!brandMatches.length) return { reason: "weak", scored };
  const [best, second] = brandMatches;
  const why = [best.addr && "address", best.branch && "branch", best.dist != null && `${best.dist.toFixed(1)} km from ${cafe.neighbourhood}`]
    .filter(Boolean)
    .join(", ");
  if (best.evidence < 0) return { reason: "far", scored, best, why };
  if (second && second.evidence >= best.evidence) return { reason: "ambiguous", scored, best, why };
  // A lone brand match with no supporting location evidence is still risky for a multi-location brand.
  if (!second && best.evidence === 0 && branch) return { reason: "ambiguous", scored, best, why };
  return { reason: null, scored, best, why };
}

// ---- main ---------------------------------------------------------------------
async function main() {
  if (!KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY. Add it to .env.local:\n\n  GOOGLE_PLACES_API_KEY=your-key\n");
    process.exit(1);
  }

  const cafes = JSON.parse(fs.readFileSync(SEED, "utf8"));
  const takenBy = new Map(cafes.filter((c) => c.placeId).map((c) => [c.placeId, c.name]));
  const todo = cafes.filter((c) => FORCE || !c.placeId).slice(0, LIMIT);
  console.log(`${cafes.length} cafes · ${todo.length} to look up${DRY ? " · DRY RUN (nothing will be written)" : ""}\n`);

  const review = [];
  const closed = [];
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
    const tag = `[${String(i + 1).padStart(3)}/${todo.length}]`;
    const { brand, branch } = splitName(cafe.name);
    const where = cafe.address ? cafe.address.replace(/,?\s*(Toronto|North York|Scarborough|Etobicoke),?\s*ON\s*$/i, "") : cafe.neighbourhood;
    const query = [brand, branch, where, "Toronto, ON"].filter(Boolean).join(" ");
    const cats = cafe.cafe_categories || [];
    const typed = !(cats.includes("Bakery & Cafe") || cats.includes("Dessert Cafe")) || cats.includes("Specialty Coffee");

    let result;
    try {
      let results = await textSearch(query, typed ? "cafe" : undefined);
      result = decide(cafe, results);
      if (typed && (result.reason === "no_results" || result.reason === "weak")) {
        await sleep(120);
        results = await textSearch(query, undefined); // e.g. Google files it as a bakery or restaurant
        result = decide(cafe, results);
      }
    } catch (err) {
      if ([400, 401, 403].includes(err.status)) {
        save();
        console.error(`\n${tag} ${cafe.name}: ${err.message}\n\nStopping: check the key and that "Places API (New)" is enabled.`);
        process.exit(1);
      }
      console.log(`${tag} ERROR      ${cafe.name}: ${err.message}`);
      review.push({ name: cafe.name, reason: "error", query, detail: err.message, candidates: [] });
      await sleep(1000);
      continue;
    }

    const { best } = result;
    let reason = result.reason;
    if (!reason && takenBy.has(best.id) && takenBy.get(best.id) !== cafe.name) reason = "duplicate";

    if (reason) {
      const extra = reason === "duplicate" ? ` (place already used by "${takenBy.get(best.id)}")` : "";
      console.log(`${tag} ${reason.toUpperCase().padEnd(10)} ${cafe.name}${extra}`);
      for (const c of result.scored.slice(0, 3)) {
        console.log(`             · ${c.name} (name ${Math.round(c.name_score * 100)}%) · ${c.address}${c.businessStatus && c.businessStatus !== "OPERATIONAL" ? ` · ${c.businessStatus}` : ""}`);
      }
      review.push({
        name: cafe.name,
        reason,
        query,
        candidates: result.scored.slice(0, 3).map((c) => ({
          name: c.name,
          address: c.address,
          googleMapsUri: c.googleMapsUri,
          placeId: c.id,
          businessStatus: c.businessStatus,
          nameMatch: Math.round(c.name_score * 100) / 100,
        })),
      });
    } else {
      const isClosed = best.businessStatus === "CLOSED_PERMANENTLY";
      if (isClosed) closed.push(cafe.name);
      console.log(`${tag} ${isClosed ? "CLOSED    " : "MATCH     "} ${cafe.name}  →  ${best.name} · ${best.address}  [${result.why || "name only"}]`);
      if (cafe.placeId && cafe.placeId !== best.id) takenBy.delete(cafe.placeId);
      // Store ONLY the place ID and Maps link (plus our own closed flag). Never the address or location.
      cafe.placeId = best.id;
      if (best.googleMapsUri) cafe.googleMapsUri = best.googleMapsUri;
      if (isClosed) cafe.verification_status = "closed";
      takenBy.set(best.id, cafe.name);
      saved++;
      unsaved++;
      if (unsaved >= 10) save();
    }
    await sleep(120);
  }

  save();
  if (!DRY) {
    if (review.length) fs.writeFileSync(REVIEW, JSON.stringify(review, null, 2) + "\n");
    else if (fs.existsSync(REVIEW)) fs.unlinkSync(REVIEW);
  }

  console.log(
    `\n${DRY ? "Would save" : "Saved"} ${saved} · permanently closed ${closed.length} · need manual review ${review.length}` +
      (DRY ? " · DRY RUN, nothing written" : review.length ? ` · see ${path.relative(ROOT, REVIEW)}` : ""),
  );
  if (closed.length) console.log(`Marked closed (hidden on the site): ${closed.join("; ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
