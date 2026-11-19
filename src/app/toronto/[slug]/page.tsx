import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCafeViews } from "@/lib/data";
import { COLLECTIONS, getCollection, MIN_COLLECTION_SIZE, visibleCollections } from "@/lib/collections";
import { CafeCard } from "@/components/CafeCard";
import { serializeJsonLd } from "@/lib/json-ld";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const collection = getCollection((await params).slug);
  if (!collection) return { title: "Collection not found" };
  return {
    title: collection.title,
    description: collection.description,
    alternates: { canonical: `/toronto/${collection.slug}` },
    openGraph: { title: `${collection.title} · ${SITE.name}`, description: collection.description },
  };
}

export default async function CollectionPage({ params }: Params) {
  const collection = getCollection((await params).slug);
  if (!collection) notFound();
  const all = await getCafeViews();
  const cafes = all.filter(collection.test).sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "en-CA"));
  if (cafes.length < MIN_COLLECTION_SIZE) notFound(); // never publish a thin list
  const others = visibleCollections(all).filter((x) => x.collection.slug !== collection.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: collection.title,
    description: collection.description,
    numberOfItems: cafes.length,
    itemListElement: cafes.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE.url}/cafes/${c.slug}`, name: c.name })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="pt-8 text-sm">
        <Link href="/categories" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All collections
        </Link>
      </nav>
      <header className="grid gap-6 border-b border-ink pb-10 pt-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Toronto · {cafes.length} places</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">{collection.title}</h1>
        </div>
        <p className="max-w-xl text-lg leading-relaxed text-ink-2">{collection.intro}</p>
      </header>

      <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {cafes.map((c, i) => (
          <li key={c.id}>
            <CafeCard cafe={c} priority={i < 3} />
          </li>
        ))}
      </ul>

      {collection.query && (
        <p className="mt-14 text-sm text-muted">
          Want to narrow it down?{" "}
          <Link href={`/cafes?q=${encodeURIComponent(collection.query)}`} className="link-quiet text-ink">
            Search and filter these in the explorer
          </Link>
          .
        </p>
      )}

      {others.length > 0 && (
        <section aria-labelledby="more" className="mt-20">
          <h2 id="more" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
            More collections
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {others.map(({ collection: c, cafes: list }) => (
              <li key={c.slug}>
                <Link href={`/toronto/${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-4 py-2 text-sm text-ink-2 hover:border-sand-strong hover:bg-sand">
                  {c.title} <span className="tabular-nums text-muted">{list.length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
