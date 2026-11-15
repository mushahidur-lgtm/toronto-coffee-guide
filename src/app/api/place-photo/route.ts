import { NextResponse, type NextRequest } from "next/server";
import { getAllCafes } from "@/lib/data";
import {
  fetchPlacePhotoMedia,
  getPlacePhotoMeta,
  isPhotoOfPlace,
  PLACE_ID_RE,
  PlacesError,
} from "@/lib/google-places";

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
 * Errors: 400 bad input · 404 unknown cafe / no such place · 429 quota reached · 503 no API key · 502 Google error.
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
  const w = Math.min(Math.max(Number(params.get("w")) || 800, 100), 1600);

  if (!PLACE_ID_RE.test(placeId)) return json({ error: "invalid_place_id" }, 400);

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
