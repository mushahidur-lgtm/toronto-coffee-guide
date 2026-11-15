import type { Metadata } from "next";
import { getCafeViews } from "@/lib/data";
import { MapExplorer } from "@/components/map/MapExplorer";
import type { MapMode } from "@/components/map/shared";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Map",
  description: "Explore Toronto coffee shops on a map: third-wave roasters, espresso bars, matcha, bakery-cafes and places to work, filtered by what's open now.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  // Advanced markers need both a browser key and a Map ID; otherwise use the Leaflet/OSM fallback.
  const mode: MapMode =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ? "google" : "leaflet";
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY && !process.env.NEXT_PUBLIC_GOOGLE_MAP_ID) {
    console.warn("[map] NEXT_PUBLIC_GOOGLE_MAP_ID is not set: /map falls back to Leaflet (Advanced Markers need a Map ID).");
  }

  const all = await getCafeViews();
  // Google terms: Google-sourced coordinates may only be shown on a Google map, so they are only
  // sent to the browser when the Google map will render.
  const cafes = mode === "google" ? all : all.map((c) => ({ ...c, google_location: null }));

  return (
    <>
      <h1 className="sr-only">Map of Toronto coffee shops</h1>
      <MapExplorer cafes={cafes} mode={mode} />
    </>
  );
}
