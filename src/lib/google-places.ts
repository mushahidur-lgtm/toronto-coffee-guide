import "server-only";
import type { LivePlace } from "./types";

/**
 * Google Places API (New) — server-side only. The API key never reaches the browser.
 *
 * Terms compliance (https://cloud.google.com/maps-platform/terms/maps-service-terms):
 *  - Only the Place ID is stored permanently (it is exempt from caching restrictions).
 *  - Photos are never stored or cached: /api/place-photo looks up the current photo and streams the
 *    image bytes with `Cache-Control: no-store`, using `cache: "no-store"` for every upstream call.
 *    The UI shows the author attribution and a Google Maps link with every photo.
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
}

/** Text details for a cafe page (no photos — those load lazily via /api/place-photo). */
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
    };
  } catch (err) {
    console.warn(`[places] details ${placeId} failed`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Photos — always uncached
// ---------------------------------------------------------------------------

export const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const PHOTO_REF_RE = /^[A-Za-z0-9_-]{10,1000}$/;

/** Errors from Google, mapped to the status our route should return. */
export class PlacesError extends Error {
  constructor(public status: number, public code: "quota" | "not_found" | "upstream" | "no_key", message: string) {
    super(message);
  }
}

function upstreamError(res: Response, what: string): PlacesError {
  if (res.status === 429) return new PlacesError(429, "quota", "Google Places quota reached");
  if (res.status === 404) return new PlacesError(404, "not_found", `${what} not found`);
  return new PlacesError(502, "upstream", `Google Places ${what} → HTTP ${res.status}`);
}

export interface PlacePhotoMeta {
  /** Photo resource name: places/{placeId}/photos/{ref}. null = the place has no photos. */
  photoName: string | null;
  authorName: string | null;
  authorUri: string | null;
  googleMapsUri: string | null;
}

/** Latest photo + attribution for a place. Field mask: photos,googleMapsUri. */
export async function getPlacePhotoMeta(placeId: string): Promise<PlacePhotoMeta> {
  const key = placesApiKey();
  if (!key) throw new PlacesError(503, "no_key", "GOOGLE_PLACES_API_KEY is not set");
  const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos,googleMapsUri" },
    cache: "no-store",
  });
  if (!res.ok) throw upstreamError(res, "place");
  const body = (await res.json()) as {
    googleMapsUri?: string;
    photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  };
  const photo = body.photos?.[0];
  const author = photo?.authorAttributions?.[0];
  return {
    photoName: photo?.name ?? null,
    authorName: author?.displayName ?? null,
    authorUri: author?.uri ?? null,
    googleMapsUri: body.googleMapsUri ?? null,
  };
}

/** Is `photoName` a well-formed photo resource of `placeId`? (stops the route proxying arbitrary paths) */
export function isPhotoOfPlace(photoName: string, placeId: string): boolean {
  const prefix = `places/${placeId}/photos/`;
  return photoName.startsWith(prefix) && PHOTO_REF_RE.test(photoName.slice(prefix.length));
}

/** Fetch the image bytes (Google redirects to the image; fetch follows it). Never cached. */
export async function fetchPlacePhotoMedia(photoName: string, maxWidthPx: number): Promise<Response> {
  const key = placesApiKey();
  if (!key) throw new PlacesError(503, "no_key", "GOOGLE_PLACES_API_KEY is not set");
  const res = await fetch(`${API}/${photoName}/media?maxWidthPx=${maxWidthPx}`, {
    headers: { "X-Goog-Api-Key": key },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok || !res.body) throw upstreamError(res, "photo");
  return res;
}
