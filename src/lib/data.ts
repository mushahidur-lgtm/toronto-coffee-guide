import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import seed from "@data/cafes.seed.json";
import type { Cafe, CafeView, LivePlace } from "./types";
import { httpUrl, normalizeCafe } from "./normalize-cafe";
import { getPlaceDetails, placesEnabled } from "./google-places";
import { googleMapsSearchUrl } from "./maps";
import { deriveAttributes } from "./explorer";
import { resolveCafeImages } from "./images";
import { IMAGE_RECORDS } from "./images-manifest";

/**
 * Data access. The frontend only ever calls these functions, so swapping the JSON seed for
 * Supabase/PostgreSQL (or anything else) needs no UI changes.
 */
export function supabaseEnabled(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

async function loadFromSupabase(): Promise<Cafe[]> {
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.from("cafes").select("*").neq("verification_status", "closed").order("name");
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []).map((r) => normalizeCafe(r as Record<string, unknown>));
}

function loadFromSeed(): Cafe[] {
  return (seed as Record<string, unknown>[])
    .map(normalizeCafe)
    .filter((c) => c.verification_status !== "closed")
    .sort((a, b) => a.name.localeCompare(b.name, "en-CA"));
}

export const getAllCafes = cache(async (): Promise<Cafe[]> => {
  if (supabaseEnabled()) {
    try {
      return await loadFromSupabase();
    } catch (err) {
      console.error("[data] Supabase unavailable, falling back to seed file:", err);
    }
  }
  return loadFromSeed();
});

/** Merge a stored cafe with live Google data. Editorial values are the fallback. */
export function toView(cafe: Cafe, live: LivePlace | null): CafeView {
  const images = resolveCafeImages(cafe, IMAGE_RECORDS, { slim: true }); // full credits are resolved on the cafe page
  const hours = live?.hours?.length ? live.hours : cafe.opening_hours;
  const address = live?.address ?? cafe.address;
  return {
    ...cafe,
    verification_status:
      live?.businessStatus === "CLOSED_PERMANENTLY" ? "closed" : live?.businessStatus === "OPERATIONAL" ? "verified" : cafe.verification_status,
    address,
    website_url: cafe.website_url ?? httpUrl(live?.website),
    phone: cafe.phone ?? live?.phone ?? null,
    google_maps_url: httpUrl(live?.mapsUrl) ?? cafe.google_maps_url ?? googleMapsSearchUrl(cafe.name, address, cafe.google_place_id),
    opening_hours: hours ?? null,
    hours_source: live?.hours?.length ? "google" : cafe.opening_hours ? "editorial" : null,
    image: images.primary,
    image_category: images.placeholderCategory,
    google_data: !!live,
    google_location: live?.latitude != null && live.longitude != null ? { lat: live.latitude, lng: live.longitude } : null,
    attributes: deriveAttributes(cafe, live?.outdoorSeating ?? null),
    google_rating: live?.rating ?? null,
    google_review_count: live?.userRatingCount ?? null,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function enrich(cafes: Cafe[]): Promise<CafeView[]> {
  if (!placesEnabled()) return cafes.map((c) => toView(c, null));
  const views = await mapLimit(cafes, 8, async (c) =>
    toView(c, c.google_place_id ? await getPlaceDetails(c.google_place_id) : null),
  );
  // Hide businesses Google reports as permanently closed.
  return views.filter((v) => v.verification_status !== "closed");
}

let closedLogged = false;

/**
 * THE list of cafes the site shows. Every page, count, map and sitemap uses this, so numbers always agree.
 * It drops cafes marked closed in the data and cafes Google reports as CLOSED_PERMANENTLY.
 */
export const getCafeViews = cache(async (): Promise<CafeView[]> => {
  const all = await getAllCafes();
  const views = await enrich(all);
  if (!closedLogged && views.length < all.length) {
    closedLogged = true;
    const shown = new Set(views.map((v) => v.id));
    const hidden = all.filter((c) => !shown.has(c.id)).map((c) => c.name);
    console.info(`[data] Hiding ${hidden.length} cafe(s) Google reports as permanently closed: ${hidden.join("; ")}`);
  }
  return views;
});

export const getCafeBySlug = cache(async (slug: string): Promise<CafeView | null> => {
  const cafe = (await getAllCafes()).find((c) => c.slug === slug);
  if (!cafe) return null;
  const [view] = await enrich([cafe]);
  return view ?? null;
});
