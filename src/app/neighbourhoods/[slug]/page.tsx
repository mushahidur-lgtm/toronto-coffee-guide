import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { getCafeViews } from "@/lib/data";
import { getNeighbourhoodBySlug, NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { NEIGHBOURHOOD_INTROS } from "@/lib/neighbourhood-intros";
import { DRINK_FACETS, FOOD_FACETS, FACET_GROUPS } from "@/lib/facets";
import { CafeCard } from "@/components/CafeCard";
import { CafePhoto } from "@/components/CafePhoto";
import { CafeLocationMap } from "@/components/CafeLocationMap";

export const revalidate = 3600;

export async function generateStaticParams() {
  const used = new Set((await getCafeViews()).map((c) => c.neighbourhood));
  return NEIGHBOURHOODS.filter((n) => used.has(n.name)).map((n) => ({ slug: n.slug }));
}

type Params = { params: Promise<{ slug: string }> };

/** Cafes in a neighbourhood; pages exist only for neighbourhoods with at least one listing. */
async function load(slug: string) {
  const hood = getNeighbourhoodBySlug(slug);
  if (!hood) return null;
  const all = await getCafeViews();
  const cafes = all.filter((c) => c.neighbourhood === hood.name);
  if (!cafes.length) return null;
  return { hood, cafes, all };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: "Neighbourhood not found" };
  const { hood, cafes } = data;
  return {
    title: `Cafes in ${hood.name}`,
    description:
      NEIGHBOURHOOD_INTROS[hood.name] ??
      `${cafes.length} coffee ${cafes.length === 1 ? "shop" : "shops"} and cafes in ${hood.name}, Toronto.`,
    alternates: { canonical: `/neighbourhoods/${hood.slug}` },
  };
}

export default async function NeighbourhoodPage({ params }: Params) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { hood, cafes, all } = data;
  const intro = NEIGHBOURHOOD_INTROS[hood.name];

  // Popular categories: menu facets that at least one cafe here actually lists, most common first.
  const popular = [
    ...DRINK_FACETS.filter((f) => f.key !== "espresso" && f.key !== "latte").map((f) => ({ f, param: FACET_GROUPS.drinks.param })),
    ...FOOD_FACETS.map((f) => ({ f, param: FACET_GROUPS.food.param })),
  ]
    .map(({ f, param }) => ({ ...f, param, count: cafes.filter(f.test).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);

  const hoodParam = encodeURIComponent(hood.name);
  const photos = cafes.filter((c) => c.photo || c.google_place_id).slice(0, 3);

  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.neighbourhood, (counts.get(c.neighbourhood) ?? 0) + 1);
  const nearby = NEIGHBOURHOODS.filter((n) => n.region === hood.region && n.slug !== hood.slug && counts.get(n.name));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="pt-8 text-sm">
        <Link href="/neighbourhoods" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All neighbourhoods
        </Link>
      </nav>

      <header className="grid gap-8 border-b border-ink pb-10 pt-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{hood.region}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Cafes in {hood.name}</h1>
          {intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{intro}</p>}
          <p className="mt-4 text-sm text-muted">
            {cafes.length} {cafes.length === 1 ? "place" : "places"} listed
          </p>

          {popular.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Popular here</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {popular.map((p) => (
                  <li key={p.key}>
                    <Link
                      href={`/cafes?n=${hoodParam}&${p.param}=${p.key}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-sm hover:border-ink"
                    >
                      {p.label} <span className="text-muted">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href={`/map?n=${hoodParam}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2"
          >
            <MapIcon size={15} strokeWidth={1.5} aria-hidden /> View on the map
          </Link>
        </div>

        <div className="hidden lg:block">
          <CafeLocationMap name={hood.name} googleLocation={null} editorialLocation={null} area={{ name: hood.name, lat: hood.lat, lng: hood.lng }} useGoogle={false} areaNote={`Approximate ${hood.name} area. Open the map for each cafe.`} />
        </div>
      </header>

      {photos.length >= 3 && (
        <section aria-label={`Photos from cafes in ${hood.name}`} className="mt-10 hidden gap-3 sm:grid sm:grid-cols-3">
          {photos.map((c) => (
            <CafePhoto key={c.id} name={c.name} photo={c.photo} placeId={c.google_place_id} width={600} href={`/cafes/${c.slug}`} className="aspect-[4/3] overflow-hidden rounded-lg" />
          ))}
        </section>
      )}

      <section aria-labelledby="hood-cafes" className="mt-12">
        <h2 id="hood-cafes" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
          Where to go
        </h2>
        <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {cafes.map((c, i) => (
            <li key={c.id}>
              <CafeCard cafe={c} priority={i < 3} />
            </li>
          ))}
        </ul>
      </section>

      {nearby.length > 0 && (
        <section aria-labelledby="nearby" className="mt-16">
          <h2 id="nearby" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
            More in {hood.region}
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {nearby.map((n) => (
              <li key={n.slug}>
                <Link href={`/neighbourhoods/${n.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
                  {n.name} <span className="text-muted">{counts.get(n.name)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
