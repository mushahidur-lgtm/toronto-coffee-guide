import { NextResponse, type NextRequest } from "next/server";
import { getAllCafes } from "@/lib/data";
import {
  fetchPlacePhotoMedia,
  getPlacePhotoMeta,
  getPlacePhotos,
  isPhotoOfPlace,
  PLACE_ID_RE,
  PlacesError,
} from "@/lib/google-places";
import { checkRateLimit, clientIp, snapPhotoWidth } from "@/lib/rate-limit";

/**
 * Live Google Places photos, never cached or stored (Google Maps Platform terms).
 *
 *   GET /api/place-photo?placeId=ChIJ…[&w=800]
 *     → 200 { photo: { imageUrl, authorName, authorUri } | null, googleMapsUri }
 *       imageUrl points back at this route (below), so the API key never reaches the browser.
 *
 *   GET /api/place-photo?placeId=ChIJ…&photo=places/ChIJ…/photos/…[&w=800]
 *     → the image bytes, streamed from Google.
 *
 * `w` is snapped to 400, 800 or 1200. Requests are rate limited per IP (see lib/rate-limit.ts).
 *
 * Errors: 400 bad input · 404 unknown cafe / no such place · 429 rate_limited (ours, with Retry-After) or
 * quota (Google's) · 503 no API key · 502 Google error.
 * Every response carries Cache-Control: no-store.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const placeId = params.get("placeId") ?? "";
  const photo = params.get("photo");
  const w = snapPhotoWidth(params.get("w")); // 400 / 800 / 1200 only

  if (!PLACE_ID_RE.test(placeId)) return json({ error: "invalid_place_id" }, 400);

  // Per-IP limit before anything that can reach Google (no-op unless Upstash env vars are set).
  const rl = await checkRateLimit(clientIp(req.headers));
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  // Only serve places that belong to a listed cafe, so the route can't be used to spend our quota on anything else.
  const cafes = await getAllCafes();
  if (!cafes.some((c) => c.google_place_id === placeId)) return json({ error: "unknown_place" }, 404);

  try {
    if (photo) {
      if (!isPhotoOfPlace(photo, placeId)) return json({ error: "invalid_photo" }, 400);
      const upstream = await fetchPlacePhotoMedia(photo, w);
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...NO_STORE,
          "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // ?all=1 → up to 6 photos for the cafe page gallery (each still streamed through this route).
    if (params.get("all") === "1") {
      const list = await getPlacePhotos(placeId, 6);
      return json({
        photos: list.photos
          .filter((p) => p.photoName)
          .map((p) => ({
            imageUrl: `/api/place-photo?${new URLSearchParams({ placeId, photo: p.photoName!, w: String(w) })}`,
            authorName: p.authorName,
            authorUri: p.authorUri,
          })),
        googleMapsUri: list.googleMapsUri,
      });
    }

    const meta = await getPlacePhotoMeta(placeId);
    const imageUrl = meta.photoName
      ? `/api/place-photo?${new URLSearchParams({ placeId, photo: meta.photoName, w: String(w) })}`
      : null;
    return json({
      photo: imageUrl ? { imageUrl, authorName: meta.authorName, authorUri: meta.authorUri } : null,
      googleMapsUri: meta.googleMapsUri,
    });
  } catch (err) {
    if (err instanceof PlacesError) {
      if (err.status >= 500) console.warn(`[place-photo] ${placeId}: ${err.message}`);
      return json({ error: err.code }, err.status);
    }
    console.error(`[place-photo] ${placeId}`, err);
    return json({ error: "upstream" }, 502);
  }
}
