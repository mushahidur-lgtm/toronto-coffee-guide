"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { useFavourites } from "@/lib/favourites";
import { CafeCard } from "./CafeCard";

/** Saved cafes (from localStorage), newest first, with a neighbourhood filter. */
export function FavouritesView({ cafes }: { cafes: CafeView[] }) {
  const { favourites } = useFavourites();
  const [mounted, setMounted] = useState(false);
  const [hood, setHood] = useState("all");
  useEffect(() => setMounted(true), []);

  const bySlug = useMemo(() => new Map(cafes.map((c) => [c.slug, c])), [cafes]);
  const saved = useMemo(() => favourites.map((s) => bySlug.get(s)).filter((c): c is CafeView => !!c), [favourites, bySlug]);
  const hoods = useMemo(() => Array.from(new Set(saved.map((c) => c.neighbourhood))).sort(), [saved]);
  const shown = hood === "all" ? saved : saved.filter((c) => c.neighbourhood === hood);
  useEffect(() => {
    if (hood !== "all" && !hoods.includes(hood)) setHood("all");
  }, [hood, hoods]);

  if (!mounted) return <div className="h-40" aria-busy="true" />;

  if (!saved.length) {
    return (
      <div className="rounded-lg bg-cream px-6 py-16 text-center">
        <Heart size={28} strokeWidth={1.4} className="mx-auto text-clay" aria-hidden />
        <p className="mt-4 text-lg font-medium">No saved cafes yet</p>
        <p className="mx-auto mt-2 max-w-md text-muted">
          Tap the heart on any cafe to save it here. Favourites stay in this browser, so there&rsquo;s no account needed.
        </p>
        <Link href="/cafes" className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm text-paper hover:bg-[#2b2b2b]">
          Explore cafes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p className="text-sm text-muted" aria-live="polite">
          <span className="font-medium text-ink">{shown.length}</span> of {saved.length} saved {saved.length === 1 ? "place" : "places"}
        </p>
        {hoods.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Neighbourhood</span>
            <select value={hood} onChange={(e) => setHood(e.target.value)} className="rounded-md border border-line bg-paper px-2 py-1.5 outline-none hover:border-ink-2 focus:border-ink">
              <option value="all">All ({saved.length})</option>
              {hoods.map((h) => (
                <option key={h} value={h}>
                  {h} ({saved.filter((c) => c.neighbourhood === h).length})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <li key={c.id}>
            <CafeCard cafe={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}
