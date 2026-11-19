import type { Cafe, VerificationStatus } from "./types";
import { googleMapsSearchUrl } from "./maps";
import { isExplorerCategory } from "./explorer";
import { deriveVenueType, isVenueType } from "./venue";

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** true / false, or null when unknown (anything that isn't a boolean). */
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/**
 * Only absolute http(s) URLs. Rejects javascript:, data:, protocol-relative and malformed values,
 * so nothing unsafe can end up in an href or src.
 */
export function httpUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Images may also be site-relative ("/cafes/foo.jpg" from /public); "//host" is rejected. */
function imageUrl(v: unknown): string | null {
  const s = str(v);
  if (s && /^\/(?!\/)[A-Za-z0-9._~\-/%]+$/.test(s)) return s;
  return httpUrl(s);
}

/** "2026-11-15" or an ISO timestamp → "2026-11-15"; anything else (or an impossible date) → null. */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
    ? `${m[1]}-${m[2]}-${m[3]}`
    : null;
}

/** Accepts a seed entry or a database row and fills every field with a safe default. */
export function normalizeCafe(raw: Record<string, unknown>): Cafe {
  const name = String(raw.name ?? "").trim();
  // Always re-slugify (DB slugs included) so a slug can only ever be [a-z0-9-].
  const slug = slugify(str(raw.slug) ?? name) || slugify(name) || "cafe";
  const address = str(raw.address);
  // Seed file uses camelCase `placeId` / `googleMapsUri`; database rows use snake_case.
  const placeId = str(raw.placeId) ?? str(raw.google_place_id);
  const mapsUri = httpUrl(raw.googleMapsUri) ?? httpUrl(raw.google_maps_url);
  const now = "2026-11-15T00:00:00.000Z";
  const hours = arr(raw.opening_hours);
  return {
    id: str(raw.id) ?? slug,
    name,
    slug,
    description: str(raw.description),
    address,
    neighbourhood: str(raw.neighbourhood) ?? "Toronto",
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    location_source: str(raw.location_source),
    website_url: httpUrl(raw.website_url),
    google_maps_url: mapsUri ?? googleMapsSearchUrl(name, address, placeId),
    google_place_id: placeId,
    phone: str(raw.phone),
    instagram_url: httpUrl(raw.instagram_url),
    image_url: imageUrl(raw.image_url),
    image_credit: str(raw.image_credit),
    specialty_drinks: arr(raw.specialty_drinks),
    food_offerings: arr(raw.food_offerings),
    cuisine_types: arr(raw.cuisine_types),
    cafe_categories: arr(raw.cafe_categories),
    tags: arr(raw.tags),
    opening_hours: hours.length ? hours : null,
    featured: raw.featured === true,
    verification_status: (["verified", "closed"].includes(raw.verification_status as string)
      ? raw.verification_status
      : "unverified") as VerificationStatus,
    last_verified: isoDate(raw.last_verified),
    explorer_categories: arr(raw.explorer_categories).filter(isExplorerCategory),
    has_wifi: bool(raw.has_wifi),
    has_patio: bool(raw.has_patio),
    roasts_in_house: bool(raw.roasts_in_house),
    laptop_friendly: bool(raw.laptop_friendly),
    is_chain: raw.is_chain === true,
    collections: arr(raw.collections).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)),
    venue_type: isVenueType(raw.venue_type)
      ? raw.venue_type
      : deriveVenueType({ cafe_categories: arr(raw.cafe_categories), tags: arr(raw.tags) }),
    source: str(raw.source),
    created_at: str(raw.created_at) ?? now,
    updated_at: str(raw.updated_at) ?? now,
  };
}
