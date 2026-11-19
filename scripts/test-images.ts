/**
 * Tests for the image system rules.   npm run test:images
 * Covers approved photos, cafes with none, invalid or unattributed records, duplicates, source priority,
 * illustrative fallbacks, and the real manifest + files on disk.
 */
import fs from "node:fs";
import path from "node:path";
import seed from "../data/cafes.seed.json";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { IMAGE_RECORDS } from "../src/lib/images-manifest";
import { hashString, illustrativeCategory, resolveCafeImages, validateManifest, validateRecord, type CafeLike, type ImageRecord } from "../src/lib/images";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(66)} → ${JSON.stringify(got)}${ok ? "" : `  (want ${JSON.stringify(want)})`}`);
};

const cafe = (id: string, extra: Partial<CafeLike> = {}): CafeLike => ({ id, slug: id, name: id.replace(/-/g, " "), cafe_categories: [], specialty_drinks: [], food_offerings: [], ...extra });

let n = 0;
const rec = (over: Partial<ImageRecord> = {}): ImageRecord => {
  n++;
  return {
    id: `r${n}`, cafeId: "moonbean", scope: "venue", category: "exterior", role: "primary", source: "openverse", provider: "flickr",
    file: `/images/cafes/moonbean/${n}-abcd${n}.jpg`, width: 1600, height: 1000, blur: "data:image/webp;base64,AAAA", color: "#a1b2c3", alt: "Moonbean from the street",
    title: "Moonbean", creator: "A. Photographer", creatorUrl: "https://flickr.com/p/a", license: "by", licenseVersion: "2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/", sourceUrl: `https://flickr.com/photos/a/${n}`, originalUrl: `https://live.staticflickr.com/${n}.jpg`,
    approval: "approved", approvedBy: "tester", approvedAt: "2026-11-18", lastVerified: "2026-11-18", ...over,
  };
};
const illus = (category: string, over: Partial<ImageRecord> = {}) =>
  rec({ cafeId: null, scope: "illustrative", category, role: "primary", file: `/images/illustrative/${category}-x${n + 1}.jpg`, alt: `Illustrative photo of ${category}`, ...over });

// ---- cafes with approved photographs -------------------------------------------------------------------------
{
  const r = resolveCafeImages(cafe("moonbean"), [rec()]);
  check("approved venue photo → primary, scope venue", [r.primary?.scope, r.primary?.label], ["venue", null]);
  check("credit carries creator, licence and source", [r.primary?.credit.creator, r.primary?.credit.license, !!r.primary?.credit.sourceUrl], ["A. Photographer", "CC BY 2.0", true]);
  check("provider label for Flickr", r.primary?.credit.provider, "Flickr");
  const slim = resolveCafeImages(cafe("moonbean"), [rec()], { slim: true }).primary;
  check("slim result drops the blur image but keeps the colour", [slim?.blur, slim?.color], [undefined, "#a1b2c3"]);
  check("slim credit keeps creator + licence, drops title and provider", [slim?.credit.creator, slim?.credit.license, slim?.credit.title, slim?.credit.provider], ["A. Photographer", "CC BY 2.0", undefined, undefined]);
  const slimIll = resolveCafeImages(cafe("x-cafe", { cafe_categories: ["Matcha Cafe"] }), [illus("matcha")], { slim: true }).primary;
  check("slim illustrative image leaves alt to the UI", [slimIll?.alt, slimIll?.label], [undefined, "Illustrative photo"]);
  const wantPrimary = rec();
  const two = resolveCafeImages(cafe("moonbean"), [rec({ role: "gallery" }), wantPrimary, rec({ role: "gallery" })]);
  check("primary role first, the other two go to the gallery", [two.primary?.id === wantPrimary.id, two.gallery.length], [true, 2]);
  // matches by slug as well as id
  check("matches the cafe by slug when id differs", !!resolveCafeImages({ ...cafe("x"), id: "uuid-1", slug: "moonbean" }, [rec()]).primary, true);
  // a photo of ANOTHER cafe never leaks in
  check("another cafe's photo is not used", resolveCafeImages(cafe("other-cafe"), [rec()], { illustrative: false }).primary, null);
}

// ---- source priority -----------------------------------------------------------------------------------------
{
  const official = rec({ source: "official", provider: null, license: "permission", licenseVersion: null, licenseUrl: null, role: "gallery", lastVerified: "2025-01-01" });
  const ov = rec({ source: "openverse", role: "gallery", lastVerified: "2026-11-18" });
  const wm = rec({ source: "wikimedia", provider: "wikimedia", role: "gallery" });
  const r = resolveCafeImages(cafe("moonbean"), [wm, ov, official]);
  check("official > openverse > wikimedia (even if older)", [r.primary?.id, r.gallery.map((g) => g.id)], [official.id, [ov.id, wm.id]]);
}

// ---- cafes with no photographs -------------------------------------------------------------------------------
{
  const none = resolveCafeImages(cafe("brand-new-cafe"), []);
  check("no records → no image (UI draws a placeholder)", [none.primary, none.gallery.length], [null, 0]);
  const withIll = resolveCafeImages(cafe("brand-new-cafe", { cafe_categories: ["Matcha Cafe"] }), [illus("matcha")]);
  check("no own photo → labelled illustrative photo", [withIll.primary?.scope, withIll.primary?.label], ["illustrative", "Illustrative photo"]);
  check("illustrative alt text says it is not the cafe", /not a photo of brand new cafe/.test(withIll.primary?.alt ?? ""), true);
  const off = resolveCafeImages(cafe("brand-new-cafe", { cafe_categories: ["Matcha Cafe"] }), [illus("matcha")], { illustrative: false });
  check("illustrative fallback can be switched off", off.primary, null);
  const wrongCat = resolveCafeImages(cafe("brand-new-cafe", { cafe_categories: ["Matcha Cafe"] }), [illus("pastry")]);
  check("only the matching category is used", wrongCat.primary, null);
  const pool = [illus("espresso"), illus("espresso"), illus("espresso")];
  const a = resolveCafeImages(cafe("some-cafe"), pool).primary?.id;
  const b = resolveCafeImages(cafe("some-cafe"), [...pool].reverse()).primary?.id;
  check("illustrative pick is deterministic per cafe", a, b);
  check("hashString is stable", hashString("moonbean"), hashString("moonbean"));
  // A portrait photo can't fill a 16:9 hero: it goes to the gallery and the hero falls back.
  const portrait = rec({ width: 1200, height: 1800, role: "gallery" });
  const pOnly = resolveCafeImages(cafe("moonbean", { cafe_categories: ["Matcha Cafe"] }), [portrait, illus("matcha")]);
  check("portrait-only venue photo → gallery, hero is the illustrative one", [pOnly.primary?.scope, pOnly.gallery.length], ["illustrative", 1]);
  const landscape = rec({ role: "gallery" });
  const pPlusLandscape = resolveCafeImages(cafe("moonbean"), [portrait, landscape], { illustrative: false });
  check("landscape photo is the hero even if the portrait sorts first", [pPlusLandscape.primary?.id === landscape.id, pPlusLandscape.gallery.length], [true, 1]);
  const venueWins = resolveCafeImages(cafe("moonbean", { cafe_categories: ["Matcha Cafe"] }), [illus("matcha"), rec()]);
  check("own photo beats illustrative", venueWins.primary?.scope, "venue");
  check("illustrative never appears in the gallery", venueWins.gallery.length, 0);
}

// ---- invalid / unattributed / unapproved ---------------------------------------------------------------------
{
  const resolved = (r: ImageRecord) => resolveCafeImages(cafe("moonbean"), [r], { illustrative: false }).primary;
  check("missing creator on a CC BY image → not published", resolved(rec({ creator: null })), null);
  check("missing licence URL on a CC BY image → not published", resolved(rec({ licenseUrl: null })), null);
  check("CC0 without a creator is fine", !!resolved(rec({ license: "cc0", licenseVersion: "1.0", creator: null, licenseUrl: null })), true);
  check("pending approval → not published", resolved(rec({ approval: "pending", approvedAt: null, approvedBy: null })), null);
  check("rejected → not published", resolved(rec({ approval: "rejected" })), null);
  check("approved without an approver → not published", resolved(rec({ approvedBy: null })), null);
  check("too small (900px) → not published", resolved(rec({ width: 900 })), null);
  check("non-commercial licence → not published", resolved(rec({ license: "by-nc" as never })), null);
  check("no-derivatives licence → not published", resolved(rec({ license: "by-nd" as never })), null);
  check("stock source as a venue photo → not published", resolved(rec({ source: "pexels", license: "pexels", creator: "X", licenseUrl: null })), null);
  check("stock source is fine as illustrative", validateRecord(illus("espresso", { source: "pexels", license: "pexels", creator: "X", licenseUrl: null })), []);
  check("missing alt text → not published", resolved(rec({ alt: " " })), null);
  check("missing blur placeholder → not published", resolved(rec({ blur: "" })), null);
  check("missing average colour → not published", resolved(rec({ color: "" })), null);
  check("file outside /images → not published", resolved(rec({ file: "https://evil.example/x.jpg" })), null);
  check("bad source URL → not published", resolved(rec({ sourceUrl: "not a url" })), null);
  check("venue image without a cafe → invalid", validateRecord(rec({ cafeId: null })).length > 0, true);
  check("illustrative image tied to a cafe → invalid", validateRecord(illus("matcha", { cafeId: "moonbean" })).length > 0, true);
  check("a valid record has no issues", validateRecord(rec()), []);
}

// ---- duplicates ----------------------------------------------------------------------------------------------
{
  const a = rec({ role: "gallery" });
  const dupFile = rec({ role: "gallery", file: a.file, originalUrl: "https://live.staticflickr.com/other.jpg" });
  const r = resolveCafeImages(cafe("moonbean"), [a, dupFile], { illustrative: false });
  check("same file twice → shown once", [r.primary ? 1 : 0, r.gallery.length], [1, 0]);
  const dupOrigin = rec({ originalUrl: a.originalUrl });
  check("manifest check flags the same original used twice", validateManifest([a, dupOrigin]).some((p) => /duplicate original/.test(p.issue)), true);
  check("manifest check flags the same file used twice", validateManifest([a, dupFile]).some((p) => /duplicate file/.test(p.issue)), true);
  check("manifest check flags two primaries for one cafe", validateManifest([rec(), rec()]).some((p) => /2 primary/.test(p.issue)), true);
  check("manifest check flags unknown cafe ids", validateManifest([rec({ cafeId: "ghost" })], new Set(["moonbean"])).some((p) => /unknown cafeId/.test(p.issue)), true);
  const same = rec();
  check("manifest check flags a reused image id", validateManifest([same, { ...same }]).some((p) => /used 2 times/.test(p.issue)), true);
}

// ---- category mapping ----------------------------------------------------------------------------------------
{
  const cat = (c: Partial<CafeLike>) => illustrativeCategory(cafe("x", c));
  check("matcha cafe → matcha", cat({ cafe_categories: ["Matcha Cafe"] }), "matcha");
  check("matcha on the menu → matcha", cat({ specialty_drinks: ["Matcha latte"] }), "matcha");
  check("Vietnamese cafe → vietnamese-coffee", cat({ cafe_categories: ["Vietnamese Cafe"] }), "vietnamese-coffee");
  check("bingsu → dessert", cat({ food_offerings: ["Bingsu"] }), "dessert");
  check("tea house → tea", cat({ cafe_categories: ["Tea House"] }), "tea");
  check("bakery cafe → pastry", cat({ cafe_categories: ["Bakery & Cafe"] }), "pastry");
  check("specialty coffee → pour-over", cat({ cafe_categories: ["Specialty Coffee"] }), "pour-over");
  check("brunch cafe → cafe-interior", cat({ cafe_categories: ["Brunch Cafe"] }), "cafe-interior");
  check("nothing known → espresso", cat({}), "espresso");
}

// ---- the real manifest, data file and files on disk ----------------------------------------------------------
{
  const cafes = (seed as Record<string, unknown>[]).map(normalizeCafe);
  const ids = new Set(cafes.map((c) => c.id));
  check("every cafe has an explicit, unique id", [cafes.length, ids.size, (seed as { id?: string }[]).every((c) => !!c.id)], [cafes.length, cafes.length, true]);
  check("every cafe id equals its slug (no URL changed)", cafes.filter((c) => c.id !== c.slug).length, 0);
  check("real manifest passes every check", validateManifest(IMAGE_RECORDS, ids), []);
  const missing = IMAGE_RECORDS.filter((r) => !fs.existsSync(path.join(__dirname, "..", "public", r.file))).map((r) => r.id);
  check("every manifest file exists on disk", missing, []);
  check("no approved venue image belongs to a closed cafe", IMAGE_RECORDS.filter((r) => r.cafeId && cafes.find((c) => c.id === r.cafeId)?.verification_status === "closed").length, 0);
}

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
