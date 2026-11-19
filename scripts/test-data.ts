/**
 * Data integrity tests against the seed.   npm run test:data
 * Canonical list, unique ids, links, coordinates, hours and image attribution, with no network access.
 */
import seed from "../data/cafes.seed.json";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { googleMapsDirectionsUrl, isInstagramUrl } from "../src/lib/maps";
import { IMAGE_RECORDS } from "../src/lib/images-manifest";
import { resolveCafeImages, validateManifest } from "../src/lib/images";
import { hasReadableHours } from "../src/lib/hours";
import { NEIGHBOURHOODS } from "../src/lib/neighbourhoods";

let failed = 0;
const check = (label: string, pass: boolean, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label.padEnd(64)} ${detail}`);
};

const all = (seed as Record<string, unknown>[]).map(normalizeCafe);
const published = all.filter((c) => c.verification_status !== "closed");

check("seed has cafes", all.length > 100, String(all.length));
check("ids are unique", new Set(all.map((c) => c.id)).size === all.length);
check("slugs are unique", new Set(all.map((c) => c.slug)).size === all.length);
check("published list excludes closed cafes", published.length === all.filter((c) => c.verification_status !== "closed").length && published.length < all.length, `${published.length}/${all.length}`);
check("every published cafe is in a known neighbourhood", published.every((c) => NEIGHBOURHOODS.some((n) => n.name === c.neighbourhood)), published.filter((c) => !NEIGHBOURHOODS.some((n) => n.name === c.neighbourhood)).map((c) => c.name).join(", "));

// Links: only http(s); directions always resolve to something.
const badUrl = published.filter((c) => c.website_url && !/^https?:\/\//i.test(c.website_url));
check("website URLs are http(s)", badUrl.length === 0, badUrl.map((c) => c.name).join(", "));
const wm = published.filter((c) => c.website_url && /google\.[a-z.]+\/maps|goo\.gl|maps\.app/.test(c.website_url));
check("website field never holds a Google Maps link", wm.length === 0, wm.map((c) => c.name).join(", "));
check("every cafe has a directions link", published.every((c) => /^https:\/\/www\.google\.com\/maps\//.test(googleMapsDirectionsUrl(c.name, c.address, c.google_place_id))));
check("Instagram detection", isInstagramUrl("https://www.instagram.com/foo/") === true && isInstagramUrl("https://foo.com") === false);

// Coordinates: inside the Greater Toronto Area, with a recorded source.
const withCoords = published.filter((c) => c.latitude != null && c.longitude != null);
const outside = withCoords.filter((c) => c.latitude! < 43.55 || c.latitude! > 43.9 || c.longitude! < -79.7 || c.longitude! > -79.1);
check("coordinates are inside Toronto", outside.length === 0, outside.map((c) => c.name).join(", "));
check("every coordinate records its source", withCoords.every((c) => !!c.location_source));
check("most cafes have an exact location", withCoords.length / published.length > 0.85, `${withCoords.length}/${published.length}`);

// Hours: when editorial hours are present they must be readable, never a half-parsed schedule.
const unreadable = published.filter((c) => c.opening_hours?.length && !hasReadableHours(c.opening_hours));
check("editorial hours are all readable", unreadable.length === 0, unreadable.map((c) => c.name).join(", "));

// Images: valid manifest, every published cafe resolves to a labelled image, attribution is complete, no cafe-less venue records.
const issues = validateManifest(IMAGE_RECORDS, new Set(all.map((c) => c.id)));
check("image manifest has no issues", issues.length === 0, issues.slice(0, 3).map((i) => `${i.id}: ${i.issue}`).join("; "));
const resolved = published.map((c) => ({ c, r: resolveCafeImages(c, IMAGE_RECORDS) }));
check("every cafe resolves to an image", resolved.every((x) => x.r.primary), resolved.filter((x) => !x.r.primary).map((x) => x.c.name).join(", "));
check("generic photos are labelled and never claim to be the cafe", resolved.filter((x) => x.r.primary?.scope === "illustrative").every((x) => x.r.primary!.label === "Illustrative photo" && /not a photo of/.test(x.r.primary!.alt ?? "not a photo of")));
check("every image has creator, licence and source", IMAGE_RECORDS.filter((r) => r.approval === "approved").every((r) => r.creator !== undefined && r.license && (r.sourceUrl || r.source === "official" || r.source === "submitted")));
const venueFiles = resolved.filter((x) => x.r.primary?.scope === "venue").map((x) => x.r.primary!.src);
check("no venue photo is shared between cafes", new Set(venueFiles).size === venueFiles.length);

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
