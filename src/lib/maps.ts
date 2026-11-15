/**
 * Google Maps URLs (https://developers.google.com/maps/documentation/urls/get-started).
 * These are plain links — no API key is needed or exposed.
 */
export function googleMapsSearchUrl(name: string, address: string | null, placeId?: string | null): string {
  const query = encodeURIComponent([name, address ?? "Toronto, ON"].join(", "));
  const pid = placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${query}${pid}`;
}

export function googleMapsDirectionsUrl(name: string, address: string | null, placeId?: string | null): string {
  const dest = encodeURIComponent([name, address ?? "Toronto, ON"].join(", "));
  const pid = placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${pid}`;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** True for instagram.com / instagr.am profile links (some cafes use Instagram as their website). */
export function isInstagramUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am";
  } catch {
    return false;
  }
}

export function instagramHandle(url: string): string {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : displayUrl(url);
}
