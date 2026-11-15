import type { Metadata } from "next";
import { getAllCafes } from "@/lib/data";
import { NeighbourhoodGrid } from "@/components/NeighbourhoodGrid";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Neighbourhoods",
  description: "Browse Toronto coffee shops by neighbourhood, from Kensington Market and Leslieville to North York and Etobicoke.",
  alternates: { canonical: "/neighbourhoods" },
};

export default async function NeighbourhoodsPage() {
  const cafes = await getAllCafes();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="pb-12 pt-14 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Neighbourhoods</h1>
        <p className="mt-3 max-w-xl text-ink-2">
          Toronto&rsquo;s coffee culture, street by street: {cafes.length} cafes across{" "}
          {new Set(cafes.map((c) => c.neighbourhood)).size} neighbourhoods.
        </p>
      </header>
      <NeighbourhoodGrid cafes={cafes} />
    </div>
  );
}
