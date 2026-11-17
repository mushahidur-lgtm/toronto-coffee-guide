import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { visibleCollections } from "@/lib/collections";
import { VENUE_TYPES } from "@/lib/venue";
import { CollectionCard } from "@/components/CollectionCard";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Categories & collections",
  description: "Browse Toronto cafes by collection (matcha, Vietnamese coffee, specialty coffee, pastries, Japanese cafes) and by venue type.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const cafes = await getCafeViews();
  const collections = visibleCollections(cafes);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="pb-10 pt-14 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Categories</h1>
        <p className="mt-3 max-w-xl text-ink-2">Curated collections and venue types across {cafes.length} places in Toronto.</p>
      </header>

      <section aria-labelledby="venue-types">
        <h2 id="venue-types" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
          By venue type
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {VENUE_TYPES.map((v) => {
            const count = cafes.filter((c) => c.venue_type === v.slug).length;
            return (
              <li key={v.slug}>
                <Link
                  href={`/cafes?venue=${v.slug}`}
                  className="block h-full rounded-lg border border-line bg-paper p-5 transition-colors hover:border-sand-strong hover:bg-cream"
                >
                  <span className="block font-semibold">{v.label}</span>
                  <span className="mt-1 block text-sm text-ink-2">{v.hint}</span>
                  <span className="mt-3 block text-sm text-muted">{count} places →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="collections" className="mt-16">
        <h2 id="collections" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
          Collections
        </h2>
        <ul className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map(({ collection, cafes: list }) => (
            <li key={collection.slug}>
              <CollectionCard collection={collection} cafes={list} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
