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

export function instagramHandle(url: string): string {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : displayUrl(url);
}
