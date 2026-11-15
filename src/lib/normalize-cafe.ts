import type { Cafe, VerificationStatus } from "./types";
import { googleMapsSearchUrl } from "./maps";

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

/** Accepts a seed entry or a database row and fills every field with a safe default. */
export function normalizeCafe(raw: Record<string, unknown>): Cafe {
  const name = String(raw.name ?? "").trim();
  const slug = str(raw.slug) ?? slugify(name);
  const address = str(raw.address);
  // Seed file uses camelCase `placeId` / `googleMapsUri`; database rows use snake_case.
  const placeId = str(raw.placeId) ?? str(raw.google_place_id);
  const mapsUri = str(raw.googleMapsUri) ?? str(raw.google_maps_url);
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
    website_url: str(raw.website_url),
    google_maps_url: mapsUri ?? googleMapsSearchUrl(name, address, placeId),
    google_place_id: placeId,
    phone: str(raw.phone),
    instagram_url: str(raw.instagram_url),
    image_url: str(raw.image_url),
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
    source: str(raw.source),
    created_at: str(raw.created_at) ?? now,
    updated_at: str(raw.updated_at) ?? now,
  };
}
