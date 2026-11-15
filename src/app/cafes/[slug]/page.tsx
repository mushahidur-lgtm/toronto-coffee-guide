import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { getCafeBySlug, getCafeViews } from "@/lib/data";
import { CafePhoto } from "@/components/CafePhoto";
import { CafeCard } from "@/components/CafeCard";
import { Hours } from "@/components/Hours";
import { displayUrl, googleMapsDirectionsUrl, instagramHandle, isInstagramUrl } from "@/lib/maps";
import { neighbourhoodSlug } from "@/lib/neighbourhoods";
import { formatMonthYear, parseHours, todayName } from "@/lib/hours";
import { SITE } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getCafeViews()).map((c) => ({ slug: c.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const cafe = (await getCafeViews()).find((c) => c.slug === slug);
  if (!cafe) return { title: "Cafe not found" };
  const desc = cafe.description ?? `${cafe.name}, a cafe in ${cafe.neighbourhood}, Toronto.`;
  return {
    title: `${cafe.name} — ${cafe.neighbourhood}`,
    description: desc,
    alternates: { canonical: `/cafes/${cafe.slug}` },
    openGraph: { title: cafe.name, description: desc, type: "article" },
  };
}

export default async function CafePage({ params }: Params) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  if (!cafe) notFound();

  const related = (await getCafeViews())
    .filter((c) => c.id !== cafe.id && c.neighbourhood === cafe.neighbourhood)
    .slice(0, 3);

  const DAY_MAP: Record<string, string> = {
    Monday: "Mo", Tuesday: "Tu", Wednesday: "We", Thursday: "Th", Friday: "Fr", Saturday: "Sa", Sunday: "Su",
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: cafe.name,
    url: `${SITE.url}/cafes/${cafe.slug}`,
    description: cafe.description ?? undefined,
    address: cafe.address
      ? { "@type": "PostalAddress", streetAddress: cafe.address, addressLocality: "Toronto", addressRegion: "ON", addressCountry: "CA" }
      : undefined,
    telephone: cafe.phone ?? undefined,
    sameAs: [cafe.website_url, cafe.instagram_url].filter(Boolean),
    servesCuisine: cafe.cuisine_types.length ? cafe.cuisine_types : undefined,
    hasMap: cafe.google_maps_url ?? undefined,
    openingHours: parseHours(cafe.opening_hours)
      .filter((d) => !/closed/i.test(d.hours))
      .map((d) => `${DAY_MAP[d.day]} ${d.hours}`),
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="border-t border-line py-6">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );

  const List = ({ items }: { items: string[] }) =>
    items.length ? (
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    ) : (
      <p className="text-muted">Not available</p>
    );

  return (
    <article className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="pt-8 text-sm">
        <Link href="/cafes" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All cafes
        </Link>
      </nav>

      <header className="pb-10 pt-8">
        <Link
          href={`/neighbourhoods/${neighbourhoodSlug(cafe.neighbourhood)}`}
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          {cafe.neighbourhood}
        </Link>
        <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">{cafe.name}</h1>
        {cafe.cafe_categories.length > 0 && (
          <p className="mt-4 text-ink-2">
            {[
              ...cafe.cafe_categories,
              ...cafe.cuisine_types.filter((cu) => !cafe.cafe_categories.some((t) => t.toLowerCase().startsWith(cu.toLowerCase()))),
            ].join(" · ")}
          </p>
        )}
      </header>

      <CafePhoto
        photo={cafe.photo}
        placeId={cafe.google_place_id}
        name={cafe.name}
        width={1200}
        className="aspect-[16/9] sm:aspect-[21/9]"
        priority
      />

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr] lg:gap-20">
        <div>
          {cafe.description ? (
            <p className="text-xl leading-relaxed tracking-[-0.005em] sm:text-2xl">{cafe.description}</p>
          ) : (
            <p className="text-xl text-muted">No description yet.</p>
          )}

          <div className="mt-10 grid gap-x-10 sm:grid-cols-2">
            <Section title="Specialty drinks">
              <List items={cafe.specialty_drinks} />
            </Section>
            <Section title="Food menu highlights">
              <List items={cafe.food_offerings} />
            </Section>
          </div>
          {cafe.tags.length > 0 && (
            <Section title="Good to know">
              <p className="text-ink-2">{cafe.tags.join(" · ")}</p>
            </Section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Section title="Address">
            {cafe.address ? <p>{cafe.address}</p> : <p className="text-muted">Not available</p>}
            <p className="mt-1 text-muted">{cafe.neighbourhood}, Toronto</p>
          </Section>
          <Section title="Opening hours">
            <Hours hours={cafe.opening_hours} variant="full" source={cafe.hours_source} today={todayName()} mapsUrl={cafe.google_maps_url} />
          </Section>
          <Section title="Links">
            <ul className="space-y-2">
              {cafe.website_url && (
                <li>
                  <a href={cafe.website_url} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
                    {isInstagramUrl(cafe.website_url) ? `Instagram ${instagramHandle(cafe.website_url)}` : displayUrl(cafe.website_url)}{" "}
                    <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                  </a>
                </li>
              )}
              <li>
                <a href={cafe.google_maps_url ?? "#"} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
                  View on Google Maps <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                </a>
              </li>
              <li>
                <a
                  href={googleMapsDirectionsUrl(cafe.name, cafe.address, cafe.google_place_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-quiet inline-flex items-center gap-1"
                >
                  Get directions <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                </a>
              </li>
              <li>
                <Link href={`/map?selected=${encodeURIComponent(cafe.slug)}`} className="link-quiet inline-flex items-center gap-1">
                  <MapPin size={14} strokeWidth={1.5} aria-hidden /> View on map
                </Link>
              </li>
              {cafe.instagram_url && !(isInstagramUrl(cafe.website_url) && cafe.website_url === cafe.instagram_url) && (
                <li>
                  <a href={cafe.instagram_url} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
                    Instagram {instagramHandle(cafe.instagram_url)} <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                  </a>
                </li>
              )}
            </ul>
          </Section>
          {cafe.phone && (
            <Section title="Phone">
              <a href={`tel:${cafe.phone.replace(/[^\d+]/g, "")}`} className="link-quiet">
                {cafe.phone}
              </a>
            </Section>
          )}
          <p className="border-t border-line pt-6 text-xs leading-relaxed text-muted">
            {cafe.last_verified && (
              <span className="mb-1.5 block text-ink-2">
                Last verified <time dateTime={cafe.last_verified}>{formatMonthYear(cafe.last_verified)}</time>
              </span>
            )}
            {cafe.verification_status === "verified"
              ? "Business status confirmed with Google Maps."
              : "Details are editorial and haven't been confirmed against Google Maps yet."}{" "}
            {cafe.google_data && "Address and hours from Google Maps. "}Information can change, so check with the cafe before visiting.
          </p>
        </aside>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-24">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id="related" className="text-xl font-semibold tracking-tight sm:text-2xl">
              More in {cafe.neighbourhood}
            </h2>
            <Link href={`/neighbourhoods/${neighbourhoodSlug(cafe.neighbourhood)}`} className="link-quiet text-sm text-muted hover:text-ink">
              See all
            </Link>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((c) => (
              <li key={c.id}>
                <CafeCard cafe={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
