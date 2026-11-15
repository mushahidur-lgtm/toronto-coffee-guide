/** Category values used for the "Cafe type" filter. Free-form extra categories are allowed. */
export const CAFE_TYPES = [
  "Specialty Coffee",
  "Matcha Cafe",
  "Vietnamese Cafe",
  "Japanese Cafe",
  "Korean Cafe",
  "Bakery & Cafe",
  "Brunch Cafe",
  "Dessert Cafe",
] as const;

export type CafeType = (typeof CAFE_TYPES)[number];

export type VerificationStatus = "unverified" | "verified" | "closed";

export interface PhotoAttribution {
  displayName: string;
  uri?: string | null;
}

/** An editorial (own/licensed) photo. Google photos are never stored; they load live via /api/place-photo. */
export interface CafePhoto {
  kind: "url";
  ref: string;
  attributions: PhotoAttribution[];
}

/**
 * One entry of data/cafes.seed.json as written by hand / by scripts.
 * Only `name` and `neighbourhood` are required; normalizeCafe() fills the rest.
 */
export interface SeedCafe {
  name: string;
  neighbourhood: string;
  address?: string | null;
  description?: string | null;
  specialty_drinks?: string[];
  food_offerings?: string[];
  cuisine_types?: string[];
  cafe_categories?: string[];
  tags?: string[];
  website_url?: string | null;
  instagram_url?: string | null;
  phone?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  opening_hours?: string[] | null;
  featured?: boolean;
  source?: string | null;
  verification_status?: VerificationStatus;
  /** Google Places (New) place ID, set by scripts/populate-place-ids.js. Maps to Cafe.google_place_id. */
  placeId?: string;
  /** Google Maps link for the place, set by scripts/populate-place-ids.js. Maps to Cafe.google_maps_url. */
  googleMapsUri?: string;
}

/** A row of the `cafes` table (or one entry of data/cafes.seed.json). */
export interface Cafe {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  neighbourhood: string;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;
  phone: string | null;
  instagram_url: string | null;
  /** A licensed/own photograph of this specific cafe. Never a stock image. */
  image_url: string | null;
  image_credit: string | null;
  specialty_drinks: string[];
  food_offerings: string[];
  cuisine_types: string[];
  cafe_categories: string[];
  /** Extra searchable keywords (e.g. "egg coffee", "pour-over"). */
  tags: string[];
  /** Weekday descriptions, e.g. "Monday: 8:00 AM – 6:00 PM". null = not available. */
  opening_hours: string[] | null;
  featured: boolean;
  verification_status: VerificationStatus;
  /** Where the editorial information came from. */
  source: string | null;
  created_at: string;
  updated_at: string;
}

/** Live data from Google Places (New). Fetched at request time, cached briefly, never persisted. */
export interface LivePlace {
  address: string | null;
  hours: string[] | null;
  website: string | null;
  phone: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string | null;
}

/** What the UI renders: the stored cafe merged with any live Google data. */
export interface CafeView extends Cafe {
  /** Editorial photo only. When null and google_place_id is set, the UI loads a live Google photo. */
  photo: CafePhoto | null;
  /** Where the hours came from, for attribution. */
  hours_source: "google" | "editorial" | null;
  /** True when any field shown came from Google Places. */
  google_data: boolean;
  /** Live coordinates from Google — only for use on a Google map. */
  google_location: { lat: number; lng: number } | null;
}
