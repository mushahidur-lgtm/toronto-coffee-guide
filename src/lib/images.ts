/**
 * Cafe image system: a persistent, curated manifest (data/cafe-images.json) instead of per-visit API calls.
 *
 * Source priority (lower wins): official → submitted → openverse → wikimedia → pexels/unsplash (illustrative only).
 * Every record is either
 *   - scope "venue":        a photo OF that cafe (official, submitted, or an openly licensed photo someone took there), or
 *   - scope "illustrative": a generic photo of a drink or food category, never presented as the cafe itself.
 * A cafe with neither gets a category placeholder drawn in the UI.
 *
 * This module is pure (no I/O, no Next.js) so the same rules run in the site, the curation scripts and the tests.
 */

export const IMAGE_SOURCES = ["official", "submitted", "openverse", "wikimedia", "pexels", "unsplash"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

/** Lower number = preferred. Matches the order of preference in the project brief. */
export const SOURCE_PRIORITY: Record<ImageSource, number> = {
  official: 1,
  submitted: 2,
  openverse: 3,
  wikimedia: 4,
  pexels: 5,
  unsplash: 5,
};

/** Stock sources may only ever be illustrative, never a photo of a specific cafe. */
export const ILLUSTRATIVE_ONLY_SOURCES: ImageSource[] = ["pexels", "unsplash"];

/**
 * Licences we publish under. Anything NonCommercial (nc) or NoDerivatives (nd) is out: we crop, resize and re-encode
 * images, and the site carries sponsored/commercial potential. ShareAlike (by-sa) is allowed; the image stays
 * under that licence and is credited as such.
 */
export const LICENSES = ["by", "by-sa", "cc0", "pdm", "permission", "pexels", "unsplash"] as const;
export type License = (typeof LICENSES)[number];

/** Licences that legally require the creator to be named. */
const CREDIT_REQUIRED: License[] = ["by", "by-sa", "permission"];

export const IMAGE_ROLES = ["primary", "gallery"] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

export const VENUE_CATEGORIES = ["exterior", "interior", "drink", "food", "other"] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export const ILLUSTRATIVE_CATEGORIES = ["matcha", "vietnamese-coffee", "dessert", "tea", "pastry", "pour-over", "espresso", "cafe-interior"] as const;
export type IllustrativeCategory = (typeof ILLUSTRATIVE_CATEGORIES)[number];

export const ILLUSTRATIVE_LABELS: Record<IllustrativeCategory, string> = {
  matcha: "matcha",
  "vietnamese-coffee": "Vietnamese coffee",
  dessert: "dessert",
  tea: "tea",
  pastry: "pastries",
  "pour-over": "specialty coffee",
  espresso: "espresso",
  "cafe-interior": "a cafe interior",
};

export type ImageApproval = "approved" | "pending" | "rejected";

/** One entry in data/cafe-images.json. */
export interface ImageRecord {
  /** Unique image id, e.g. "snapback-coffee-1a2b3c4d". */
  id: string;
  /** Stable cafe id (the `id` field of the cafe in the data file). null for illustrative images. */
  cafeId: string | null;
  scope: "venue" | "illustrative";
  /** venue: exterior/interior/drink/food/other. illustrative: one of ILLUSTRATIVE_CATEGORIES. */
  category: string;
  role: ImageRole;
  source: ImageSource;
  /** Where the original was found, e.g. "flickr", "wikimedia". */
  provider: string | null;
  /** Site-relative path of our optimised copy, e.g. /images/cafes/snapback-coffee/1-ab12cd34.jpg. */
  file: string;
  width: number;
  height: number;
  /** Tiny base64 image (about 10px wide, WebP) for the blur-up placeholder (prevents layout shift and flashes). */
  blur: string;
  /** Average colour as #rrggbb. List pages fill the image frame with it while the photo loads (7 bytes instead of a blur image). */
  color: string;
  alt: string;
  title: string | null;
  creator: string | null;
  creatorUrl: string | null;
  license: License;
  licenseVersion: string | null;
  licenseUrl: string | null;
  /** The page the image came from (landing page), so anyone can verify it. */
  sourceUrl: string;
  /** The file we downloaded. */
  originalUrl: string | null;
  approval: ImageApproval;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Date (YYYY-MM-DD) the source page was last confirmed to still show this image and licence. */
  lastVerified: string | null;
  notes?: string;
}

export interface ImageManifest {
  version: 1;
  images: ImageRecord[];
}

export const MIN_WIDTH = 1000;
/** Hero and card frames are 16:9 / 21:9, so only landscape photos (width ÷ height at least this) can be the main image. */
export const MIN_HERO_RATIO = 1.25;

const SOURCE_LABEL: Record<string, string> = { flickr: "Flickr", wikimedia: "Wikimedia Commons", openverse: "Openverse" };

export function licenseLabel(r: Pick<ImageRecord, "license" | "licenseVersion">): string {
  switch (r.license) {
    case "by":
      return `CC BY${r.licenseVersion ? ` ${r.licenseVersion}` : ""}`;
    case "by-sa":
      return `CC BY-SA${r.licenseVersion ? ` ${r.licenseVersion}` : ""}`;
    case "cc0":
      return "CC0 1.0";
    case "pdm":
      return "Public Domain";
    case "permission":
      return "Used with permission";
    case "pexels":
      return "Pexels License";
    case "unsplash":
      return "Unsplash License";
  }
}

export function providerLabel(r: Pick<ImageRecord, "provider" | "source">): string | null {
  if (r.source === "official" || r.source === "submitted") return null;
  return (r.provider && SOURCE_LABEL[r.provider]) || (r.provider ?? null);
}

const isHttpUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Why a record can't be published, or [] when it's fine. Used by the site (invalid records are skipped, never
 * shown half-attributed) and by `npm run images:check` (which fails the build pipeline on any problem).
 */
export function validateRecord(r: ImageRecord): string[] {
  const issues: string[] = [];
  if (!r.id) issues.push("missing id");
  if (!IMAGE_SOURCES.includes(r.source)) issues.push(`unknown source "${r.source}"`);
  if (!LICENSES.includes(r.license)) issues.push(`licence "${r.license}" is not allowed`);
  if (r.scope === "venue" && !r.cafeId) issues.push("venue image without a cafeId");
  if (r.scope === "illustrative" && r.cafeId) issues.push("illustrative image must not belong to a single cafe");
  if (r.scope === "venue" && ILLUSTRATIVE_ONLY_SOURCES.includes(r.source)) issues.push(`${r.source} images may only be illustrative`);
  if (r.scope === "venue" && !(VENUE_CATEGORIES as readonly string[]).includes(r.category)) issues.push(`bad venue category "${r.category}"`);
  if (r.scope === "illustrative" && !(ILLUSTRATIVE_CATEGORIES as readonly string[]).includes(r.category)) issues.push(`bad illustrative category "${r.category}"`);
  if (!IMAGE_ROLES.includes(r.role)) issues.push(`bad role "${r.role}"`);
  if (typeof r.file !== "string" || !r.file.startsWith("/images/")) issues.push("file must be a site path under /images/");
  if (!(r.width >= MIN_WIDTH)) issues.push(`width ${r.width} is under ${MIN_WIDTH}px`);
  if (!(r.height > 0)) issues.push("missing height");
  if (!r.alt?.trim()) issues.push("missing alt text");
  if (typeof r.blur !== "string" || !r.blur.startsWith("data:image/")) issues.push("missing blur placeholder");
  if (!/^#[0-9a-f]{6}$/i.test(r.color ?? "")) issues.push("missing average colour");
  if (!isHttpUrl(r.sourceUrl)) issues.push("missing or invalid sourceUrl");
  // Attribution: licences that require credit need a creator; every record needs somewhere to link for the licence.
  if (CREDIT_REQUIRED.includes(r.license) && !r.creator?.trim()) issues.push("attribution missing: creator is required for this licence");
  if ((r.license === "by" || r.license === "by-sa") && !isHttpUrl(r.licenseUrl)) issues.push("attribution missing: licenseUrl is required for this licence");
  if (r.creatorUrl && !isHttpUrl(r.creatorUrl)) issues.push("invalid creatorUrl");
  if (r.licenseUrl && !isHttpUrl(r.licenseUrl)) issues.push("invalid licenseUrl");
  if (r.approval === "approved") {
    if (!r.approvedAt) issues.push("approved without approvedAt");
    if (!r.approvedBy) issues.push("approved without approvedBy");
    if (!r.lastVerified) issues.push("approved without lastVerified");
  }
  return issues;
}

/** What the UI needs to draw one image and its credit. */
export interface ResolvedImage {
  id: string;
  scope: "venue" | "illustrative";
  src: string;
  /** Blur-up placeholder. Omitted in slim (list) results, which use `color` instead. */
  blur?: string;
  color: string;
  /** Omitted for slim illustrative images: the UI words it from the category and the cafe's name. */
  alt?: string;
  /** Shown on the image when it is not a photo of the cafe, e.g. "Illustrative photo". */
  label: string | null;
  credit: {
    /** title, sourceUrl and provider are omitted in slim results (list pages). */
    title?: string | null;
    creator: string | null;
    /** In slim results this is already the best link for the creator (profile, else the source page). */
    creatorUrl: string | null;
    license: string;
    licenseUrl: string | null;
    sourceUrl?: string;
    provider?: string | null;
  };
}

export interface CafeImages {
  /** The image for cards and the page hero: the cafe's own photo, or an illustrative one, or null (placeholder). */
  primary: ResolvedImage | null;
  /** More approved photos of the cafe itself (never illustrative). */
  gallery: ResolvedImage[];
  /** Used for the drawn placeholder when `primary` is null. */
  placeholderCategory: IllustrativeCategory;
}

export interface CafeLike {
  id: string;
  slug: string;
  name: string;
  cafe_categories: string[];
  specialty_drinks: string[];
  food_offerings: string[];
  cuisine_types?: string[];
  tags?: string[];
}

const has = (list: string[] | undefined, re: RegExp) => !!list?.some((x) => re.test(x));

/** Which generic photo suits this cafe's menu. Matcha first, then Vietnamese coffee, desserts, tea, pastry … */
export function illustrativeCategory(c: CafeLike): IllustrativeCategory {
  const cats = c.cafe_categories;
  const drinks = c.specialty_drinks;
  const food = c.food_offerings;
  if (cats.includes("Matcha Cafe") || has(drinks, /matcha|hojicha/i)) return "matcha";
  if (cats.includes("Vietnamese Cafe") || has(drinks, /phin|egg coffee|vietnamese|salt coffee|coconut coffee/i)) return "vietnamese-coffee";
  if (cats.includes("Dessert Cafe") || cats.includes("Korean Cafe") || has(food, /bingsu|mochi|wagashi|soufflé|souffle|gelato|ice cream/i)) return "dessert";
  if (cats.includes("Tea House") || has(drinks, /bubble tea|milk tea|thai tea|chai|loose-leaf|tea/i)) return "tea";
  if (cats.includes("Bakery & Cafe") || has(food, /croissant|pastr|viennoiserie|bread|bak/i)) return "pastry";
  if (cats.includes("Specialty Coffee") || cats.includes("Roastery") || has(drinks, /pour|chemex|filter|cold brew|single/i)) return "pour-over";
  if (cats.includes("Brunch Cafe") || cats.includes("Restaurant") || cats.includes("Traditional Cafe")) return "cafe-interior";
  return "espresso";
}

/** Small stable hash so the same cafe always gets the same illustrative image. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * `slim` is for list pages, where one image per cafe is serialised into the page: it keeps only what a compact credit
 * ("Photo: Creator · Licence") needs. Cafe pages ask for the full credit (title, provider, source page) instead.
 */
function toResolved(r: ImageRecord, alt: string, label: string | null, slim = false): ResolvedImage {
  const link = r.creatorUrl ?? r.sourceUrl;
  return {
    id: r.id,
    scope: r.scope,
    src: r.file,
    ...(slim ? {} : { blur: r.blur }),
    color: r.color,
    // A slim illustrative image leaves alt out; the UI builds it from the category and the cafe's name.
    ...(slim && r.scope === "illustrative" ? {} : { alt }),
    label,
    credit: slim
      ? { creator: r.creator, creatorUrl: link, license: licenseLabel(r), licenseUrl: r.licenseUrl }
      : {
          title: r.title,
          creator: r.creator,
          creatorUrl: r.creatorUrl,
          license: licenseLabel(r),
          licenseUrl: r.licenseUrl,
          sourceUrl: r.sourceUrl,
          provider: providerLabel(r),
        },
  };
}

const usable = (r: ImageRecord) => r.approval === "approved" && validateRecord(r).length === 0;

/**
 * Pick the images for one cafe. Pure: pass in the manifest's records.
 *  - venue photos (approved + valid), best source first, `primary` role first, newest verification first;
 *  - the first landscape one becomes the hero (portrait photos can't fill a wide frame, so they only go in the gallery);
 *    the rest form the gallery (duplicates of the same file or origin dropped);
 *  - no venue photo → a deterministic illustrative image for the cafe's category, labelled as such;
 *  - nothing suitable → primary is null and the UI draws a category placeholder.
 */
export function resolveCafeImages(cafe: CafeLike, records: ImageRecord[], opts: { illustrative?: boolean; slim?: boolean } = {}): CafeImages {
  const useIllustrative = opts.illustrative !== false;
  const category = illustrativeCategory(cafe);

  const venue = records
    .filter((r) => r.scope === "venue" && (r.cafeId === cafe.id || r.cafeId === cafe.slug) && usable(r))
    .sort(
      (a, b) =>
        Number(b.role === "primary") - Number(a.role === "primary") ||
        SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] ||
        (b.lastVerified ?? "").localeCompare(a.lastVerified ?? "") ||
        a.id.localeCompare(b.id),
    );
  const seen = new Set<string>();
  const unique = venue.filter((r) => {
    const keys = [r.file, r.originalUrl, r.sourceUrl].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
  const photo = (r: ImageRecord) => toResolved(r, r.alt, null, opts.slim);
  const hero = unique.find((r) => r.width / r.height >= MIN_HERO_RATIO);
  const gallery = unique.filter((r) => r !== hero).map(photo);

  if (hero) return { primary: photo(hero), gallery, placeholderCategory: category };

  if (useIllustrative) {
    const pool = records.filter((r) => r.scope === "illustrative" && r.category === category && usable(r)).sort((a, b) => a.id.localeCompare(b.id));
    if (pool.length) {
      const pick = pool[hashString(cafe.id) % pool.length];
      const alt = `Illustrative photo of ${ILLUSTRATIVE_LABELS[category]}, not a photo of ${cafe.name}`;
      return { primary: toResolved(pick, alt, "Illustrative photo", opts.slim), gallery, placeholderCategory: category };
    }
  }
  return { primary: null, gallery, placeholderCategory: category };
}

/** Problems across the whole manifest: invalid records, duplicate ids, duplicate files/origins, extra primaries. */
export function validateManifest(records: ImageRecord[], knownCafeIds?: Set<string>): { id: string; issue: string }[] {
  const out: { id: string; issue: string }[] = [];
  const ids = new Map<string, number>();
  const files = new Map<string, string>();
  const origins = new Map<string, string>();
  const primaries = new Map<string, string[]>();
  for (const r of records) {
    for (const issue of validateRecord(r)) out.push({ id: r.id, issue });
    ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
    if (files.has(r.file) && files.get(r.file) !== r.id) out.push({ id: r.id, issue: `duplicate file, also used by ${files.get(r.file)}` });
    files.set(r.file, r.id);
    if (r.originalUrl) {
      if (origins.has(r.originalUrl) && origins.get(r.originalUrl) !== r.id) out.push({ id: r.id, issue: `duplicate original image, also ${origins.get(r.originalUrl)}` });
      origins.set(r.originalUrl, r.id);
    }
    if (r.scope === "venue" && r.approval === "approved" && r.role === "primary" && r.cafeId) {
      primaries.set(r.cafeId, [...(primaries.get(r.cafeId) ?? []), r.id]);
    }
    if (r.scope === "venue" && r.cafeId && knownCafeIds && !knownCafeIds.has(r.cafeId)) out.push({ id: r.id, issue: `unknown cafeId "${r.cafeId}"` });
  }
  for (const [id, n] of ids) if (n > 1) out.push({ id, issue: `image id used ${n} times` });
  for (const [cafe, list] of primaries) if (list.length > 1) out.push({ id: list.join(", "), issue: `cafe "${cafe}" has ${list.length} primary images` });
  return out;
}
