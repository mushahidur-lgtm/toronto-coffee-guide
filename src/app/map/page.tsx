import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { MapView, type MapCafe } from "@/components/MapView";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Map",
  description: "A map of coffee shops and cafes across Toronto.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  const cafes = await getCafeViews();
  const points: MapCafe[] = cafes.map((c) => ({
    slug: c.slug,
    name: c.name,
    neighbourhood: c.neighbourhood,
    // Google-sourced coordinates are only sent to the client when a Google map will render them.
    google_location: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ? c.google_location : null,
    editorial_location: c.latitude != null && c.longitude != null ? { lat: c.latitude, lng: c.longitude } : null,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-14 sm:pt-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Map</h1>
          <p className="mt-3 max-w-xl text-ink-2">{cafes.length} cafes across Toronto.</p>
        </div>
        <Link href="/cafes" className="link-quiet text-sm">
          List view
        </Link>
      </header>
      <MapView cafes={points} />
    </div>
  );
}
