import type { Metadata } from "next";
import { getCafeViews } from "@/lib/data";
import { FavouritesView } from "@/components/FavouritesView";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Favourites",
  description: "Your saved Toronto cafes.",
  alternates: { canonical: "/favourites" },
  robots: { index: false, follow: true }, // personal page, nothing to index
};

export default async function FavouritesPage() {
  const cafes = await getCafeViews();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="pb-8 pt-14 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Favourites</h1>
        <p className="mt-3 max-w-xl text-ink-2">Cafes you&rsquo;ve saved on this device.</p>
      </header>
      <FavouritesView cafes={cafes} />
    </div>
  );
}
