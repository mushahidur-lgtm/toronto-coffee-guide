import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, MapPin } from "lucide-react";
import { getCafeBySlug, getCafeViews } from "@/lib/data";
import { CafePhoto } from "@/components/CafePhoto";
import { CafeCard } from "@/components/CafeCard";
import { VenueBadge } from "@/components/VenueBadge";
import { Hours } from "@/components/Hours";
import { TodayHours } from "@/components/TodayHours";
import { hasReadableHours } from "@/lib/hours";
import { schemaType } from "@/lib/venue";
import { GoogleRating } from "@/components/GoogleRating";
import { FavouriteButton } from "@/components/FavouriteButton";
import { PhotoGallery } from "@/components/PhotoGallery";
import { CafeLocationMap } from "@/components/CafeLocationMap";
import { displayUrl, googleMapsDirectionsUrl, instagramHandle, isInstagramUrl } from "@/lib/maps";
import { getNeighbourhood, neighbourhoodSlug } from "@/lib/neighbourhoods";
import { formatMonthYear, parseHours, todayName } from "@/lib/hours";
import { menuSections, similarCafes } from "@/lib/menu";
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

const googleMapEnabled = !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY && process.env.NEXT_PUBLIC_GOOGLE_MAP_ID);

export default async function CafePage({ params }: Params) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  if (!cafe) notFound();

  const all = await getCafeViews();
  const similar = similarCafes(cafe, all, 3);
  const menu = menuSections(cafe);
  const hood = getNeighbourhood(cafe.neighbourhood);
  const a = cafe.attributes;
  const verifiedAmenities = [
    a.laptopFriendly && "Laptop-friendly",
    a.hasWifi && "Wi-Fi",
    a.hasPatio && "Outdoor seating / patio",
    a.roastsInHouse && "Roasts coffee in house",
  ].filter(Boolean) as string[];
  const unverified = [!a.hasWifi && "Wi-Fi", "Power outlets", "Washrooms", "Accessible entrance"].filter(Boolean) as string[];

  const DAY_MAP: Record<string, string> = {
    Monday: "Mo", Tuesday: "Tu", Wednesday: "We", Thursday: "Th", Friday: "Fr", Saturday: "Sa", Sunday: "Su",
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaType(cafe.venue_type, cafe),
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

  const menuGroups = [
    { title: "Coffee", items: menu.coffee },
    { title: "Matcha & tea", items: menu.tea },
    { title: "Specialty drinks", items: menu.specialty },
    { title: "Food & pastries", items: menu.food },
  ].filter((g) => g.items.length > 0);

  return (
    <article className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="pt-8 text-sm">
        <Link href="/cafes" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All cafes
        </Link>
      </nav>

      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-6 pb-8 pt-8">
        <div className="min-w-0">
          <Link
            href={`/neighbourhoods/${neighbourhoodSlug(cafe.neighbourhood)}`}
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink"
          >
            {cafe.neighbourhood}
          </Link>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">{cafe.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <VenueBadge venue={cafe.venue_type} cafe={cafe} className="rounded-full" />
            {cafe.cafe_categories.length > 0 && (
              <p className="text-ink-2">
                {[
                  ...cafe.cafe_categories,
                  ...cafe.cuisine_types.filter((cu) => !cafe.cafe_categories.some((t) => t.toLowerCase().startsWith(cu.toLowerCase()))),
                ].join(" · ")}
              </p>
            )}
            <GoogleRating rating={cafe.google_rating} count={cafe.google_review_count} />
          </div>
        </div>
        <div className="rounded-full border border-line px-4 py-2">
          <FavouriteButton slug={cafe.slug} name={cafe.name} variant="inline" />
        </div>
      </header>

      <div className="overflow-hidden rounded-xl">
        <CafePhoto photo={cafe.photo} placeId={cafe.google_place_id} name={cafe.name} width={1200} className="aspect-[16/9] sm:aspect-[21/9]" priority />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr] lg:gap-20">
        <div>
          {cafe.description ? (
            <p className="text-xl leading-relaxed tracking-[-0.005em] sm:text-2xl">{cafe.description}</p>
          ) : (
            <p className="text-xl text-muted">No description yet.</p>
          )}

          {/* Menu & specialties */}
          <section aria-labelledby="menu" className="mt-12">
            <h2 id="menu" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
              Menu &amp; specialties
            </h2>
            {menuGroups.length ? (
              <div className="mt-2 grid gap-x-10 sm:grid-cols-2">
                {menuGroups.map((g) => (
                  <Section key={g.title} title={g.title}>
                    <ul className="flex flex-wrap gap-1.5">
                      {g.items.map((i) => (
                        <li key={i} className="rounded-full bg-cream px-3 py-1 text-sm text-ink-2 ring-1 ring-inset ring-sand">
                          {i}
                        </li>
                      ))}
                    </ul>
                  </Section>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-muted">No menu details yet.</p>
            )}
            <p className="mt-2 text-xs text-muted">Highlights from our listing, not the full menu. Menus change, so check with the cafe.</p>
          </section>

          {/* Amenities */}
          <section aria-labelledby="amenities" className="mt-12">
            <h2 id="amenities" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
              Amenities
            </h2>
            {verifiedAmenities.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {verifiedAmenities.map((x) => (
                  <li key={x} className="flex items-center gap-2">
                    <Check size={16} strokeWidth={2} className="text-[#2f5a24]" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-muted">No amenities confirmed yet.</p>
            )}
            <p className="mt-3 text-xs text-muted">Not yet verified: {unverified.join(", ")}. We only list what we can confirm.</p>
          </section>

          {/* Tags are search keywords (aliases, spellings), not reader-facing facts, so they aren't printed here. */}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {hasReadableHours(cafe.opening_hours) && (
            <Section title="Today">
              <TodayHours hours={cafe.opening_hours} />
            </Section>
          )}
          <Section title="Address">
            {cafe.address ? <p>{cafe.address}</p> : <p className="text-muted">Not available</p>}
            <p className="mt-1 text-muted">{cafe.neighbourhood}, Toronto</p>
            <a
              href={googleMapsDirectionsUrl(cafe.name, cafe.address, cafe.google_place_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-[#2b2b2b]"
            >
              Get directions <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
            </a>
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
              {cafe.instagram_url && !(isInstagramUrl(cafe.website_url) && cafe.website_url === cafe.instagram_url) && (
                <li>
                  <a href={cafe.instagram_url} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
                    Instagram {instagramHandle(cafe.instagram_url)} <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                  </a>
                </li>
              )}
              <li>
                <a href={cafe.google_maps_url ?? "#"} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-1">
                  View on Google Maps <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
                </a>
              </li>
              <li>
                <Link href={`/map?selected=${encodeURIComponent(cafe.slug)}`} className="link-quiet inline-flex items-center gap-1">
                  <MapPin size={14} strokeWidth={1.5} aria-hidden /> View on our map
                </Link>
              </li>
            </ul>
          </Section>
          {cafe.phone && (
            <Section title="Phone">
              <a href={`tel:${cafe.phone.replace(/[^\d+]/g, "")}`} className="link-quiet">
                {cafe.phone}
              </a>
            </Section>
          )}
          <Section title="Location">
            <CafeLocationMap
              name={cafe.name}
              googleLocation={googleMapEnabled ? cafe.google_location : null}
              editorialLocation={cafe.latitude != null && cafe.longitude != null ? { lat: cafe.latitude, lng: cafe.longitude } : null}
              area={hood ? { name: hood.name, lat: hood.lat, lng: hood.lng } : null}
              useGoogle={googleMapEnabled}
            />
          </Section>
          <p className="border-t border-line pt-6 text-xs leading-relaxed text-muted">
            {cafe.last_verified && (
              <span className="mb-1.5 block text-ink-2">
                Last verified <time dateTime={cafe.last_verified}>{formatMonthYear(cafe.last_verified)}</time>
              </span>
            )}
            {cafe.verification_status === "verified"
              ? "Business status confirmed with Google Maps."
              : "Details are editorial and haven't been confirmed against Google Maps yet."}{" "}
            {cafe.google_data && "Address, hours and rating from Google Maps. "}Information can change, so check with the cafe before visiting.
          </p>
        </aside>
      </div>

      {cafe.google_place_id && !cafe.photo && <PhotoGallery placeId={cafe.google_place_id} name={cafe.name} />}

      {similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-24">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id="similar" className="text-xl font-semibold tracking-tight sm:text-2xl">
              You might also like
            </h2>
            <Link href={`/neighbourhoods/${neighbourhoodSlug(cafe.neighbourhood)}`} className="link-quiet text-sm text-muted hover:text-ink">
              More in {cafe.neighbourhood}
            </Link>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((c) => (
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
