import type { Metadata } from "next";
import Link from "next/link";
import { getCafeViews } from "@/lib/data";
import { filtersFromParams } from "@/lib/search";
import { CafeExplorer } from "@/components/CafeExplorer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Explore cafes",
  description: "Search Toronto coffee shops by name, neighbourhood, drink, food or cuisine: matcha, Vietnamese coffee, croissants, cold brew and more.",
  alternates: { canonical: "/cafes" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Filters come from the URL on the server (?q=matcha&n=…&type=…&sort=…&open=1), so a search link or the
 * search form works without JavaScript; with JavaScript the explorer takes over and updates in place.
 */
export default async function CafesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const initialFilters = filtersFromParams(first);
  // Rendered per request (it reads the URL), so there is no "last good page" to fall back on: degrade, never 500.
  const cafes = await getCafeViews(false);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-14 sm:pt-20">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">Explore cafes</h1>
          <p className="mt-3 max-w-xl text-ink-2">
            Search by name, neighbourhood, drink, food or cuisine. Results update as you type.
          </p>
        </div>
        <Link href="/map" className="link-quiet text-sm">
          Map view
        </Link>
      </header>
      <CafeExplorer cafes={cafes} autoFocus initialFilters={initialFilters} initialNow={Date.now()} />
    </div>
  );
}
