import Link from "next/link";
import { NEIGHBOURHOODS, REGION_PAGES, REGIONS } from "@/lib/neighbourhoods";
import type { Cafe } from "@/lib/types";

/** Editorial index of neighbourhoods grouped by region, with cafe counts. */
export function NeighbourhoodGrid({ cafes, compact }: { cafes: Cafe[]; compact?: boolean }) {
  const counts = new Map<string, number>();
  for (const c of cafes) counts.set(c.neighbourhood, (counts.get(c.neighbourhood) ?? 0) + 1);

  return (
    <div className={`grid gap-x-10 gap-y-10 sm:grid-cols-2 ${compact ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {REGIONS.map((region) => {
        const hoods = NEIGHBOURHOODS.filter((n) => n.region === region && counts.get(n.name));
        if (!hoods.length) return null;
        const page = REGION_PAGES.find((r) => r.name === region);
        const total = hoods.reduce((sum, n) => sum + (counts.get(n.name) ?? 0), 0);
        return (
          <div key={region}>
            <h3 className="flex items-baseline justify-between gap-4 border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              {page ? (
                <Link href={`/neighbourhoods/${page.slug}`} className="text-ink hover:underline hover:underline-offset-4">
                  {region} guide →
                </Link>
              ) : (
                region
              )}
              <span className="tabular-nums tracking-normal">{total}</span>
            </h3>
            <ul className="mt-2">
              {hoods.map((n) => (
                <li key={n.slug}>
                  <Link href={`/neighbourhoods/${n.slug}`} className="group flex items-baseline justify-between gap-4 py-1.5">
                    <span className="group-hover:underline group-hover:underline-offset-4">{n.name}</span>
                    <span className="text-sm tabular-nums text-muted">{counts.get(n.name)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
