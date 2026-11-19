import "server-only";
import type { LivePlace } from "./types";

/**
 * Google Places API (New) — server-side only. The API key never reaches the browser.
 *
 * Terms compliance (https://cloud.google.com/maps-platform/terms/maps-service-terms):
 *  - Only the Place ID is stored permanently (it is exempt from caching restrictions).
 *  - Photos are NOT requested from Google at all. Cafe images come from the curated manifest
 *    (data/cafe-images.json, see src/lib/images.ts), which avoids a billable photo request on every view.
 *  - Text details (hours, address, phone, website) are fetched at request time and held in the
 *    Next.js fetch cache for PLACES_REVALIDATE_SECONDS (default 24 hours), never written to the database.
 */
const API = "https://places.googleapis.com/v1";
const DETAIL_FIELDS = [
  "id",
  "formattedAddress",
  "regularOpeningHours.weekdayDescriptions",
  // The next 7 days as Google currently has them, with holiday / exceptional hours applied (same pricing tier as above).
  "currentOpeningHours.weekdayDescriptions",
  "currentOpeningHours.specialDays",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "businessStatus",
  "rating",
  "userRatingCount",
  // Atmosphere field for the map's "Patio" filter. Requesting it bills Place Details at the Atmosphere tier;
  // set PLACES_ATMOSPHERE_FIELDS=false to skip it (the filter then uses editorial "patio" tags only).
  ...(process.env.PLACES_ATMOSPHERE_FIELDS === "false" ? [] : ["outdoorSeating"]),
].join(",");

/** Server key for Places API (New). GOOGLE_PLACES_API_KEY is preferred; GOOGLE_MAPS_API_KEY still works. */
export function placesApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || undefined;
}

export function placesEnabled(): boolean {
  return !!placesApiKey();
}

/** Seconds a Place Details response is reused. 24 h by default: hours and ratings change slowly, and each refresh is billed. */
const revalidate = () => Number(process.env.PLACES_REVALIDATE_SECONDS) || 86400;

interface PlaceDetailsResponse {
  formattedAddress?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  currentOpeningHours?: { weekdayDescriptions?: string[]; specialDays?: { date?: { year?: number; month?: number; day?: number } }[] };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  outdoorSeating?: boolean;
  rating?: number;
  userRatingCount?: number;
}

export interface PlaceFetch {
  place: LivePlace | null;
  /** true when Google was asked and did not answer (quota, outage, network): the caller must not treat null as "no data". */
  failed: boolean;
}

const isoDay = (d?: { year?: number; month?: number; day?: number }) =>
  d?.year && d?.month && d?.day ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : null;

/** Text details for a cafe page: address, hours, phone, website, rating. No photos. */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceFetch> {
  const key = placesApiKey();
  if (!key || !placeId) return { place: null, failed: false };
  try {
    const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
      next: { revalidate: revalidate(), tags: [`place:${placeId}`] },
    });
    if (!res.ok) {
      console.warn(`[places] details ${placeId} → HTTP ${res.status}`);
      return { place: null, failed: true };
    }
    const p = (await res.json()) as PlaceDetailsResponse;
    const place: LivePlace = {
      address: p.formattedAddress ?? null,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
      currentHours: p.currentOpeningHours?.weekdayDescriptions ?? null,
      specialDays: (p.currentOpeningHours?.specialDays ?? []).map((s) => isoDay(s.date)).filter((d): d is string => !!d),
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
      mapsUrl: p.googleMapsUri ?? null,
      businessStatus: p.businessStatus ?? null,
      outdoorSeating: typeof p.outdoorSeating === "boolean" ? p.outdoorSeating : null,
      rating: typeof p.rating === "number" ? p.rating : null,
      userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    };
    return { place, failed: false };
  } catch (err) {
    console.warn(`[places] details ${placeId} failed`, err);
    return { place: null, failed: true };
  }
}

export async function getPlaceDetails(placeId: string): Promise<LivePlace | null> {
  return (await fetchPlaceDetails(placeId)).place;
}
