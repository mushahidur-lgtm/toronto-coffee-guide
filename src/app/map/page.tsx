import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { MapView, type MapMode } from "@/components/MapView";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Map",
  description: "A map of coffee shops and cafes across Toronto. Filter by drink, neighbourhood, cafe type or what's open now.",
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-14 sm:pt-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Map</h1>
          <p className="mt-3 max-w-xl text-ink-2">{all.length} cafes across Toronto.</p>
        </div>
        <Link href="/cafes" className="link-quiet text-sm">
          List view
        </Link>
      </header>
      <MapView cafes={cafes} mode={mode} />
    </div>
  );
}
