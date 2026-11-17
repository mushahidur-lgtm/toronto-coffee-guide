"use client";

/**
 * One place that configures the Google Maps JS loader (setOptions may only be called once per page),
 * shared by the /map explorer and the small map on cafe pages.
 */
let configured = false;

export const googleMapsConfigured = () =>
  !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAP_ID);

export async function loadGoogleMaps() {
  const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
  if (!configured) {
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY!,
      v: "weekly",
      language: "en",
      region: "CA",
      mapIds: [process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!],
    });
    configured = true;
  }
  return importLibrary;
}
