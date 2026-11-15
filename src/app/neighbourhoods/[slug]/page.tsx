import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCafeViews } from "@/lib/data";
import { getNeighbourhoodBySlug, NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { CafeCard } from "@/components/CafeCard";

export const revalidate = 3600;

export function generateStaticParams() {
  return NEIGHBOURHOODS.map((n) => ({ slug: n.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const hood = getNeighbourhoodBySlug((await params).slug);
  if (!hood) return { title: "Neighbourhood not found" };
  return {
    title: `Cafes in ${hood.name}`,
    description: `Coffee shops and cafes in ${hood.name}, Toronto.`,
    alternates: { canonical: `/neighbourhoods/${hood.slug}` },
  };
}

export default async function NeighbourhoodPage({ params }: Params) {
  const hood = getNeighbourhoodBySlug((await params).slug);
  if (!hood) notFound();
  const cafes = (await getCafeViews()).filter((c) => c.neighbourhood === hood.name);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="pt-8 text-sm">
        <Link href="/neighbourhoods" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> All neighbourhoods
        </Link>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-6 pt-8">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{hood.region}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">{hood.name}</h1>
        </div>
        <p className="text-sm text-muted">
          {cafes.length} {cafes.length === 1 ? "cafe" : "cafes"}
        </p>
      </header>

      {cafes.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg font-medium">No cafes listed in {hood.name} yet.</p>
          <p className="mt-2 text-muted">
            <Link href="/cafes" className="link-quiet">
              Explore all cafes
            </Link>{" "}
            instead.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {cafes.map((c, i) => (
            <li key={c.id}>
              <CafeCard cafe={c} priority={i < 3} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
