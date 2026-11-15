import { NextResponse, type NextRequest } from "next/server";
import { getPhotoUri, PHOTO_NAME_RE } from "@/lib/google-places";

/**
 * GET /api/places/photo?name=places/{placeId}/photos/{photoRef}&w=640
 *
 * Resolves a Google Places (New) photo to its short-lived googleusercontent URI and redirects to it.
 * The API key stays on the server, and the image bytes are never stored or re-hosted here.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const w = Math.min(Math.max(Number(req.nextUrl.searchParams.get("w")) || 640, 100), 1600);

  if (!PHOTO_NAME_RE.test(name)) {
    return NextResponse.json({ error: "Invalid photo name" }, { status: 400 });
  }
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ error: "Places API not configured" }, { status: 404 });
  }

  try {
    const uri = await getPhotoUri(name, w);
    if (!uri) return NextResponse.json({ error: "Photo unavailable" }, { status: 404 });
    return NextResponse.redirect(uri, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Photo lookup failed" }, { status: 502 });
  }
}
