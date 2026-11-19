import type { Metadata } from "next";
import { getCafeViews } from "@/lib/data";
import { MapExplorer } from "@/components/map/MapExplorer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Map",
  description: "Explore Toronto coffee shops on a map: third-wave roasters, espresso bars, matcha, bakery-cafes and places to work, filtered by what's open now.",
  alternates: { canonical: "/map" },
};

export default async function MapPage() {
  // Same list as the home page and /cafes. Positions come from each cafe's own coordinates (City of Toronto address
  // data); cafes without a confirmed address are drawn at their neighbourhood centre and marked approximate.
  const cafes = await getCafeViews();
  return (
    <>
      <h1 className="sr-only">Map of Toronto coffee shops</h1>
      <MapExplorer cafes={cafes} />
    </>
  );
}
