import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { getCafeViews } from "@/lib/data";
import { getNeighbourhoodBySlug, getRegionPage, NEIGHBOURHOODS, REGION_PAGES } from "@/lib/neighbourhoods";
import { NEIGHBOURHOOD_INTROS } from "@/lib/neighbourhood-intros";
import { DRINK_FACETS, FOOD_FACETS, FACET_GROUPS } from "@/lib/facets";
import type { CafeView } from "@/lib/types";
import { CafeCard } from "@/components/CafeCard";
import { CafeImage } from "@/components/CafeImage";
import { CafeLocationMap } from "@/components/CafeLocationMap";

export const revalidate = 3600;

export async function generateStaticParams() {
  const cafes = await getCafeViews();
  const used = new Set(cafes.map((c) => c.neighbourhood));
  return [
    ...REGION_PAGES.filter((r) => cafes.some((c) => regionHas(r.name, c))).map((r) => ({ slug: r.slug })),
    ...NEIGHBOURHOODS.filter((n) => used.has(n.name)).map((n) => ({ slug: n.slug })),
  ];
}

type Params = { params: Promise<{ slug: string }> };

const regionHas = (region: string, c: CafeView) => NEIGHBOURHOODS.some((n) => n.region === region && n.name === c.neighbourhood);

/**
 * A neighbourhood (cafes in it), or a region landing page (North York, Scarborough: its areas and all its cafes).
 * Pages exist only when at least one published cafe is listed there.
 */
async function load(slug: string) {
  const all = await getCafeViews();
  const region = getRegionPage(slug);
  if (region) {
    const cafes = all.filter((c) => regionHas(region.name, c));
    if (!cafes.length) return null;
    return { kind: "region" as const, name: region.name, slug: region.slug, region: region.name, lat: region.lat, lng: region.lng, cafes, all };
  }
  const hood = getNeighbourhoodBySlug(slug);
  if (!hood) return null;
  const cafes = all.filter((c) => c.neighbourhood === hood.name);
  if (!cafes.length) return null;
  return { kind: "hood" as const, name: hood.name, slug: hood.slug, region: hood.region, lat: hood.lat, lng: hood.lng, cafes, all };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: "Neighbourhood not found" };
  const { name, slug, cafes, kind } = data;
  return {
    title: kind === "region" ? `${name} Coffee Guide: cafes by area` : `Cafes in ${name}`,
    description:
      NEIGHBOURHOOD_INTROS[name] ?? `${cafes.length} coffee ${cafes.length === 1 ? "shop" : "shops"} and cafes in ${name}, Toronto.`,
    alternates: { canonical: `/neighbourhoods/${slug}` },
  };
}

export default async function NeighbourhoodPage({ params }: Params) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { kind, name, slug, region, cafes, all } = data;
  const intro = NEIGHBOURHOOD_INTROS[name];

  // Popular categories: menu facets that at least one cafe here actually lists, most common first.
  const popular = [
    ...DRINK_FACETS.filter((f) => f.key !== "espresso" && f.key !== "latte").map((f) => ({ f, param: FACET_GROUPS.drinks.param })),
    ...FOOD_FACETS.map((f) => ({ f, param: FACET_GROUPS.food.param })),
  ]
    .map(({ f, param }) => ({ ...f, param, count: cafes.filter(f.test).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);

  const filterParam = encodeURIComponent(name);
  // Real photos of cafes here only (never illustrative ones), so this strip appears only when there are three.
  const photos = cafes.filter((c) => c.image?.scope === "venue").slice(0, 3);

  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.neighbourhood, (counts.get(c.neighbourhood) ?? 0) + 1);
  // Region page: its areas. Neighbourhood page: the other areas in the same region.
  const areas = NEIGHBOURHOODS.filter((n) => n.region === region && n.slug !== slug && counts.get(n.name)).sort(
    (a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || a.name.localeCompare(b.name),
  );
  const regionPage = REGION_PAGES.find((r) => r.name === region);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-8 text-sm">
        <Link href="/neighbourhoods" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All neighbourhoods
        </Link>
        {kind === "hood" && regionPage && (
          <Link href={`/neighbourhoods/${regionPage.slug}`} className="text-muted hover:text-ink">
            {regionPage.name} guide
          </Link>
        )}
      </nav>

      <header className="grid gap-8 border-b border-ink pb-10 pt-8 lg:grid-cols-[1fr_380px] lg:gap-12">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{kind === "region" ? "Toronto" : region}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">{kind === "region" ? `${name} Coffee Guide` : `Cafes in ${name}`}</h1>
          {intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{intro}</p>}
          <p className="mt-4 text-sm text-muted">
            {cafes.length} {cafes.length === 1 ? "place" : "places"} listed
            {kind === "region" && ` across ${areas.length} ${areas.length === 1 ? "area" : "areas"}`}
          </p>

          {kind === "region" && areas.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Browse by area</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {areas.map((n) => (
                  <li key={n.slug}>
                    <Link href={`/neighbourhoods/${n.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium hover:border-ink">
                      {n.name} <span className="font-normal text-muted">{counts.get(n.name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {popular.length > 0 && (
            <div className="mt-6">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Popular here</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {popular.map((p) => (
                  <li key={p.key}>
                    <Link
                      href={`/cafes?n=${filterParam}&${p.param}=${p.key}`}
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
            href={`/map?n=${filterParam}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2"
          >
            <MapIcon size={15} strokeWidth={1.5} aria-hidden /> View on the map
          </Link>
        </div>

        <div className="hidden lg:block">
          <CafeLocationMap
            name={name}
            googleLocation={null}
            editorialLocation={null}
            area={{ name, lat: data.lat, lng: data.lng }}
            useGoogle={false}
            areaNote={`Approximate ${name} area. Open the map for each cafe.`}
          />
        </div>
      </header>

      {photos.length >= 3 && (
        <section aria-label={`Photos from cafes in ${name}`} className="mt-10 hidden gap-3 sm:grid sm:grid-cols-3">
          {photos.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-lg">
              <CafeImage name={c.name} image={c.image} category={c.image_category} href={`/cafes/${c.slug}`} className="aspect-[4/3]" sizes="(min-width: 640px) 33vw, 100vw" />
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="hood-cafes" className="mt-12">
        <h2 id="hood-cafes" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
          {kind === "region" ? `All ${cafes.length} places in ${name}` : "Where to go"}
        </h2>
        <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {cafes.map((c, i) => (
            <li key={c.id}>
              <CafeCard cafe={c} priority={i < 3} />
            </li>
          ))}
        </ul>
      </section>

      {kind === "hood" && areas.length > 0 && (
        <section aria-labelledby="nearby" className="mt-16">
          <h2 id="nearby" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
            More in {region}
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {areas.map((n) => (
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
