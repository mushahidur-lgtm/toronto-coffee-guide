"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, SlidersHorizontal, X } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { CAFE_TYPES } from "@/lib/types";
import { FILTER_NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { applyFilters, EMPTY_FILTERS, filtersFromParams, filtersToParams, indexCafe, type Filters, type SortKey } from "@/lib/search";
import { CheckList, Chip, FilterMenu, usePopoverDismiss } from "./FilterControls";
import { QUICK_SEARCHES } from "@/lib/site";
import { cafeLocation, distanceKm, type LatLng } from "@/lib/geo";
import { CafeCard } from "./CafeCard";
import { VENUE_TYPES, type VenueType } from "@/lib/venue";

const PAGE = 12;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "az", label: "Alphabetical (A–Z)" },
  { value: "za", label: "Alphabetical (Z–A)" },
  { value: "neighbourhood", label: "Neighbourhood" },
];
/** Client-only sort: needs the visitor's location, so it's never put in the URL or asked for up front. */
const NEAR_ME = "distance";

type GeoState = "idle" | "locating" | "ready" | "denied" | "unavailable";

interface Props {
  cafes: CafeView[];
  /** Shown above the results while no search or filter is active. */
  featured?: CafeView[];
  headingLevel?: "h2" | "h1";
  autoFocus?: boolean;
  /** Filters already applied on the server (from the URL). When omitted, they're read from the URL after mount. */
  initialFilters?: Filters;
  /** Server render time (ms), so "Open now" gives the same result during hydration. */
  initialNow?: number;
}

function readUrl(): Partial<Filters> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return filtersFromParams((k) => p.get(k));
}

/** Search URL for a term — chips and suggestions are real links, so they work without JavaScript. */
const searchHref = (q: string) => `/cafes?q=${encodeURIComponent(q)}`;
/** Let ctrl/cmd/shift/middle-click open the link normally; plain clicks are handled in place. */
const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function writeUrl(f: Filters) {
  const qs = filtersToParams(f).toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

export function CafeExplorer({ cafes, featured = [], autoFocus, initialFilters, initialNow }: Props) {
  const index = useMemo(() => cafes.map(indexCafe), [cafes]);
  const [filters, setFilters] = useState<Filters>(initialFilters ?? EMPTY_FILTERS);
  const [visible, setVisible] = useState(PAGE);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Restore state from the URL (?q=matcha&n=Chinatown&type=Korean%20Cafe&sort=az)
  useEffect(() => {
    if (!initialFilters) setFilters((f) => ({ ...f, ...readUrl() }));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) writeUrl(filters);
  }, [filters, ready]);

  // "Open now" is evaluated against this clock, refreshed every minute while the filter is on.
  const [now, setNow] = useState(() => (initialNow ? new Date(initialNow) : new Date()));
  useEffect(() => {
    if (!filters.openNow) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [filters.openNow]);

  // "Near me": location is requested only when the visitor picks this sort, and never leaves the browser.
  const [nearMe, setNearMe] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");

  const chooseSort = (value: string) => {
    if (value !== NEAR_ME) {
      setNearMe(false);
      update({ sort: value as SortKey });
      return;
    }
    if (origin) {
      setNearMe(true);
      setVisible(PAGE);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo("unavailable");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("ready");
        setNearMe(true);
        setVisible(PAGE);
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const deferred = useDeferredValue(filters);
  const stale = deferred !== filters;
  // Counts per venue tab reflect every other filter; the tab itself then narrows the list.
  const anyVenue = useMemo(() => applyFilters(index, { ...deferred, venue: null }, now), [index, deferred, now]);
  const venueCounts = useMemo(() => {
    const counts: Record<VenueType, number> = { "specialty-cafe": 0, "tea-matcha": 0, "restaurant-coffee": 0 };
    for (const h of anyVenue) counts[h.cafe.venue_type]++;
    return counts;
  }, [anyVenue]);
  const filtered = useMemo(
    () => (deferred.venue ? anyVenue.filter((h) => h.cafe.venue_type === deferred.venue) : anyVenue),
    [anyVenue, deferred.venue],
  );
  const { hits, distances, unlocated } = useMemo(() => {
    const distances = new Map<string, number>();
    if (!nearMe || !origin) return { hits: filtered, distances, unlocated: 0 };
    for (const h of filtered) {
      const loc = cafeLocation(h.cafe);
      if (loc) distances.set(h.cafe.id, distanceKm(origin, loc));
    }
    const sorted = [...filtered].sort((a, b) => {
      const da = distances.get(a.cafe.id);
      const db = distances.get(b.cafe.id);
      if (da == null && db == null) return a.cafe.name.localeCompare(b.cafe.name, "en-CA");
      if (da == null) return 1; // cafes without a known location go last
      if (db == null) return -1;
      return da - db;
    });
    return { hits: sorted, distances, unlocated: filtered.length - distances.size };
  }, [filtered, nearMe, origin]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setVisible(PAGE);
  };
  const toggle = (key: "neighbourhoods" | "types", value: string) => {
    setFilters((f) => {
      const cur = f[key];
      return { ...f, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
    setVisible(PAGE);
  };

  const activeFilterCount = filters.neighbourhoods.length + filters.types.length + (filters.openNow ? 1 : 0);
  const clearAll = { query: "", neighbourhoods: [], types: [], openNow: false, venue: null };
  const idle = !filters.query.trim() && activeFilterCount === 0 && !filters.venue;
  const shown = hits.slice(0, visible);

  const runQuickSearch = (q: string) => {
    update({ query: q, sort: "relevance" });
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  usePopoverDismiss();

  return (
    <div>
      {/* ——— Search ——— */}
      {/* Without JavaScript this is a plain GET to /cafes?q=…, which the server renders. */}
      <form
        role="search"
        action="/cafes"
        method="get"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
          resultsRef.current?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <label htmlFor="cafe-search" className="sr-only">
          Search coffee shops
        </label>
        <div className="relative">
          <Search size={20} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            id="cafe-search"
            name="q"
            type="search"
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search coffee shops, matcha, Vietnamese coffee, pastries..."
            className="h-14 w-full border border-line-strong bg-paper pl-12 pr-12 text-base outline-none transition-colors placeholder:text-[#8f8f8f] hover:border-ink-2 focus:border-ink sm:h-16 sm:text-lg [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => { update({ query: "" }); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </form>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Quick searches">
        {QUICK_SEARCHES.map((q) => {
          const active = filters.query.trim().toLowerCase() === q.toLowerCase();
          return (
            <a
              key={q}
              href={searchHref(q)}
              aria-current={active ? "true" : undefined}
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                e.preventDefault(); // with JavaScript, search in place instead of navigating
                if (active) update({ query: "" });
                else runQuickSearch(q);
              }}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-2"
              }`}
            >
              {q}
            </a>
          );
        })}
      </nav>

      {/* ——— Featured (only while browsing) ——— */}
      {idle && featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mt-20">
          <div className="flex items-baseline justify-between border-b border-ink pb-3">
            <h2 id="featured-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              Featured cafes
            </h2>
            <span className="text-sm text-muted">Editor&rsquo;s picks</span>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => (
              <li key={c.id}>
                <CafeCard cafe={c} priority={i < 3} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ——— Results ——— */}
      <section ref={resultsRef} aria-labelledby="results-heading" className="mt-20 scroll-mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-3">
          <h2 id="results-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            {idle ? "All places" : "Results"}
          </h2>
          <p className="text-sm text-muted" aria-live="polite" aria-atomic="true">
            Showing <span className="font-medium text-ink">{hits.length}</span> {hits.length === 1 ? "place" : "places"} in Toronto
          </p>
        </div>

        {/* Venue type tabs */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div role="group" aria-label="Venue type" className="flex min-w-max gap-1 border-b border-line">
            {[{ slug: null, short: "All", hint: "Everything in the guide" }, ...VENUE_TYPES].map((v) => {
              const active = filters.venue === v.slug;
              const count = v.slug ? venueCounts[v.slug] : anyVenue.length;
              return (
                <button
                  key={v.slug ?? "all"}
                  type="button"
                  aria-pressed={active}
                  title={v.hint}
                  onClick={() => update({ venue: v.slug })}
                  className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                    active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {v.short}
                  <span className="tabular-nums text-xs text-muted">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line py-3 text-sm">
          <button
            type="button"
            onClick={() => setMobileFilters((o) => !o)}
            aria-expanded={mobileFilters}
            aria-controls="mobile-filters"
            className="inline-flex items-center gap-2 border border-line px-3 py-2 md:hidden"
          >
            <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <FilterMenu label="Neighbourhood" count={filters.neighbourhoods.length}>
              <CheckList options={[...FILTER_NEIGHBOURHOODS]} selected={filters.neighbourhoods} onToggle={(v) => toggle("neighbourhoods", v)} name="neighbourhood" />
            </FilterMenu>
            <FilterMenu label="Cafe type" count={filters.types.length}>
              <CheckList options={[...CAFE_TYPES]} selected={filters.types} onToggle={(v) => toggle("types", v)} name="type" />
            </FilterMenu>
            <button
              type="button"
              aria-pressed={filters.openNow}
              onClick={() => update({ openNow: !filters.openNow })}
              className={`inline-flex items-center gap-1.5 border px-3 py-2 hover:border-ink-2 ${filters.openNow ? "border-ink bg-ink text-paper hover:border-ink" : "border-line"}`}
            >
              <Clock size={14} strokeWidth={1.5} aria-hidden />
              Open now
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="sort" className="text-muted">
              Sort
            </label>
            <select
              id="sort"
              value={nearMe ? NEAR_ME : filters.sort}
              onChange={(e) => chooseSort(e.target.value)}
              disabled={geo === "locating"}
              className="border border-line bg-paper px-2 py-2 outline-none hover:border-ink-2 focus:border-ink disabled:opacity-60"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              <option value={NEAR_ME}>Near me</option>
            </select>
          </div>
        </div>

        {geo !== "idle" && (geo !== "ready" || nearMe) && (
          <p className="border-b border-line py-2.5 text-sm text-muted" role="status">
            {geo === "locating" && "Finding your location…"}
            {geo === "denied" && "Location access was declined, so the order hasn't changed. To sort by distance, allow location for this site in your browser."}
            {geo === "unavailable" && "We couldn't get your location, so the order hasn't changed. Try again in a moment."}
            {geo === "ready" && nearMe && (
              <>
                Sorted by distance from you. Your location stays in your browser.
                {unlocated > 0 && ` ${unlocated} ${unlocated === 1 ? "cafe" : "cafes"} without a known location ${unlocated === 1 ? "is" : "are"} listed last.`}
              </>
            )}
          </p>
        )}

        {mobileFilters && (
          <div id="mobile-filters" className="grid gap-6 border-b border-line py-5 md:hidden">
            <fieldset>
              <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Neighbourhood</legend>
              <CheckList options={[...FILTER_NEIGHBOURHOODS]} selected={filters.neighbourhoods} onToggle={(v) => toggle("neighbourhoods", v)} name="m-neighbourhood" columns />
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Cafe type</legend>
              <CheckList options={[...CAFE_TYPES]} selected={filters.types} onToggle={(v) => toggle("types", v)} name="m-type" columns />
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Hours</legend>
              <label htmlFor="m-open-now" className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
                <input
                  id="m-open-now"
                  type="checkbox"
                  checked={filters.openNow}
                  onChange={() => update({ openNow: !filters.openNow })}
                  className="h-4 w-4 accent-[#161616]"
                />
                Open now
              </label>
            </fieldset>
            <button type="button" onClick={() => setMobileFilters(false)} className="bg-ink py-3 text-sm text-paper">
              Show {hits.length} {hits.length === 1 ? "place" : "places"}
            </button>
          </div>
        )}

        {/* Active filters */}
        {(activeFilterCount > 0 || filters.query) && (
          <div className="flex flex-wrap items-center gap-2 py-3 text-sm">
            {filters.query && <Chip label={`“${filters.query}”`} onRemove={() => update({ query: "" })} />}
            {filters.neighbourhoods.map((n) => (
              <Chip key={n} label={n} onRemove={() => toggle("neighbourhoods", n)} />
            ))}
            {filters.types.map((t) => (
              <Chip key={t} label={t} onRemove={() => toggle("types", t)} />
            ))}
            {filters.openNow && <Chip label="Open now" onRemove={() => update({ openNow: false })} />}
            <button type="button" onClick={() => update(clearAll)} className="link-quiet ml-1 text-muted hover:text-ink">
              Clear all
            </button>
            {filters.openNow && (
              <span className="basis-full text-xs text-muted">Toronto time. Cafes without listed hours aren&rsquo;t included.</span>
            )}
          </div>
        )}

        <div aria-busy={stale} className={`transition-opacity ${stale ? "opacity-50" : ""}`}>
          {hits.length === 0 ? (
            <EmptyState
              query={filters.query}
              hasFilters={activeFilterCount > 0}
              openNow={filters.openNow}
              onPick={runQuickSearch}
              onReset={() => update(clearAll)}
            />
          ) : (
            <>
              <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((h, i) => (
                  <li key={h.cafe.id}>
                    <CafeCard
                      cafe={h.cafe}
                      highlights={filters.query ? h.highlights : []}
                      priority={idle && featured.length === 0 && i < 3}
                      distanceKm={nearMe ? distances.get(h.cafe.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-14 flex flex-col items-center gap-3 text-sm text-muted">
                <p>
                  Showing {shown.length} of {hits.length}
                </p>
                {visible < hits.length && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE)}
                    className="border border-ink px-6 py-3 text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    Load more cafes
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyState({
  query,
  hasFilters,
  openNow,
  onPick,
  onReset,
}: {
  query: string;
  hasFilters: boolean;
  openNow: boolean;
  onPick: (q: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-lg font-medium">
        {query.trim() ? <>No cafes match &ldquo;{query.trim()}&rdquo;{hasFilters ? " with these filters" : ""}.</> : "No cafes match these filters yet."}
      </p>
      {openNow && (
        <p className="mt-2 text-muted">
          &ldquo;Open now&rdquo; only includes cafes with listed hours that are open at this moment in Toronto.
        </p>
      )}
      <p className="mt-2 text-muted">
        Try a broader term, check the spelling, or remove a filter. You can search by drink, food, cuisine or neighbourhood.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {["Matcha", "Croissant", "Vietnamese", "Kensington Market", "Cold brew"].map((q) => (
          <a
            key={q}
            href={searchHref(q)}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              onPick(q);
            }}
            className="border border-line px-3 py-1.5 text-sm hover:border-ink-2"
          >
            {q}
          </a>
        ))}
      </div>
      <button type="button" onClick={onReset} className="link-quiet mt-6 text-sm">
        Clear search and filters
      </button>
    </div>
  );
}
