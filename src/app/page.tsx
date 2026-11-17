import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { visibleCollections } from "@/lib/collections";
import { CafeExplorer } from "@/components/CafeExplorer";
import { CollectionCard } from "@/components/CollectionCard";
import { NeighbourhoodGrid } from "@/components/NeighbourhoodGrid";
import { SITE } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const cafes = await getCafeViews();
  const featured = cafes.filter((c) => c.featured).slice(0, 6);
  const collections = visibleCollections(cafes);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.url}/cafes?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const collectionsSection = collections.length > 0 && (
    <section aria-labelledby="collections-heading" className="mt-20">
      <div className="flex items-baseline justify-between border-b border-ink pb-3">
        <h2 id="collections-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
          Collections
        </h2>
        <Link href="/categories" className="link-quiet text-sm text-muted hover:text-ink">
          All categories
        </Link>
      </div>
      <ul className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map(({ collection, cafes: list }) => (
          <li key={collection.slug}>
            <CollectionCard collection={collection} cafes={list} />
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      {/* Hero on a warm cream band */}
      <div className="border-b border-sand bg-cream">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pt-24 lg:px-10 lg:pt-28">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Toronto, Ontario · {cafes.length} places</p>
          <h1 className="mt-4 max-w-4xl text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
            Find Your Next Favourite Cafe in Toronto.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">{SITE.description}</p>
        </div>
      </div>

      <div className="mx-auto -mt-8 max-w-7xl px-4 sm:px-6 lg:px-10">
        <CafeExplorer cafes={cafes} featured={featured} idleContent={collectionsSection} />

        <section aria-labelledby="hoods-heading" className="mt-28">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id="hoods-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Browse by neighbourhood
            </h2>
            <Link href="/neighbourhoods" className="link-quiet text-sm text-muted hover:text-ink">
              All neighbourhoods
            </Link>
          </div>
          <div className="mt-8">
            <NeighbourhoodGrid cafes={cafes} compact />
          </div>
          <p className="mt-10 text-sm text-muted">
            Prefer a map?{" "}
            <Link href="/map" className="link-quiet text-ink">
              See every cafe on the map
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
