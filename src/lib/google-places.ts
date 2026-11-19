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
 *    Next.js fetch cache for PLACES_REVALIDATE_SECONDS (default 1 hour), never written to the database.
 */
const API = "https://places.googleapis.com/v1";
const DETAIL_FIELDS = [
  "id",
  "formattedAddress",
  "location",
  "regularOpeningHours.weekdayDescriptions",
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

const revalidate = () => Number(process.env.PLACES_REVALIDATE_SECONDS) || 3600;

interface PlaceDetailsResponse {
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  outdoorSeating?: boolean;
  rating?: number;
  userRatingCount?: number;
}

/** Text details for a cafe page: address, hours, phone, website, rating. No photos. */
export async function getPlaceDetails(placeId: string): Promise<LivePlace | null> {
  const key = placesApiKey();
  if (!key || !placeId) return null;
  try {
    const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
      next: { revalidate: revalidate(), tags: [`place:${placeId}`] },
    });
    if (!res.ok) {
      console.warn(`[places] details ${placeId} → HTTP ${res.status}`);
      return null;
    }
    const p = (await res.json()) as PlaceDetailsResponse;
    return {
      address: p.formattedAddress ?? null,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
      mapsUrl: p.googleMapsUri ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      businessStatus: p.businessStatus ?? null,
      outdoorSeating: typeof p.outdoorSeating === "boolean" ? p.outdoorSeating : null,
      rating: typeof p.rating === "number" ? p.rating : null,
      userRatingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    };
  } catch (err) {
    console.warn(`[places] details ${placeId} failed`, err);
    return null;
  }
}
