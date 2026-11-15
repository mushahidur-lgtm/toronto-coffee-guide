import "server-only";
import type { CafePhoto, LivePlace } from "./types";

/**
 * Google Places API (New) — server-side only.
 *
 * Terms compliance (https://cloud.google.com/maps-platform/terms/maps-service-terms):
 *  - Only the Place ID is stored permanently (it is exempt from caching restrictions).
 *  - Details (hours, address, phone, website, photos) are fetched at request time and held in the
 *    Next.js fetch cache for PLACES_REVALIDATE_SECONDS (default 1 hour), never written to the database.
 *  - Photos are streamed through /api/places/photo so the API key never reaches the browser,
 *    and author attributions are displayed next to every photo.
 */
const API = "https://places.googleapis.com/v1";
const FIELDS = [
  "id",
  "formattedAddress",
  "location",
  "regularOpeningHours.weekdayDescriptions",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "businessStatus",
  "photos",
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
  photos?: { name: string; authorAttributions?: { displayName: string; uri?: string }[] }[];
}

export async function getPlaceDetails(placeId: string): Promise<LivePlace | null> {
  const key = placesApiKey();
  if (!key || !placeId) return null;
  try {
    const res = await fetch(`${API}/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      next: { revalidate: revalidate(), tags: [`place:${placeId}`] },
    });
    if (!res.ok) {
      console.warn(`[places] details ${placeId} → HTTP ${res.status}`);
      return null;
    }
    const p = (await res.json()) as PlaceDetailsResponse;
    const first = p.photos?.[0];
    const photo: CafePhoto | null = first
      ? {
          kind: "google",
          ref: first.name,
          attributions: (first.authorAttributions ?? []).map((a) => ({ displayName: a.displayName, uri: a.uri ?? null })),
        }
      : null;
    return {
      address: p.formattedAddress ?? null,
      hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
      website: p.websiteUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
      mapsUrl: p.googleMapsUri ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      businessStatus: p.businessStatus ?? null,
      photo,
    };
  } catch (err) {
    console.warn(`[places] details ${placeId} failed`, err);
    return null;
  }
}

/** Resolve a Places photo resource name to a short-lived photo URI. */
export async function getPhotoUri(photoName: string, maxWidthPx: number): Promise<string | null> {
  const key = placesApiKey();
  if (!key) return null;
  const url = `${API}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": key },
    next: { revalidate: Math.min(revalidate(), 3600) },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { photoUri?: string };
  return body.photoUri ?? null;
}

export const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
