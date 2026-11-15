"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { CAFE_TYPES } from "@/lib/types";
import { FILTER_NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { applyFilters, EMPTY_FILTERS, indexCafe, type Filters, type SortKey } from "@/lib/search";
import { QUICK_SEARCHES } from "@/lib/site";
import { CafeCard } from "./CafeCard";

const PAGE = 12;

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "az", label: "Alphabetical (A–Z)" },
  { value: "za", label: "Alphabetical (Z–A)" },
  { value: "neighbourhood", label: "Neighbourhood" },
];

interface Props {
  cafes: CafeView[];
  /** Shown above the results while no search or filter is active. */
  featured?: CafeView[];
  headingLevel?: "h2" | "h1";
  autoFocus?: boolean;
}

function readUrl(): Partial<Filters> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sort = p.get("sort") as SortKey | null;
  return {
    query: p.get("q") ?? "",
    neighbourhoods: list("n"),
    types: list("type"),
    sort: SORTS.some((s) => s.value === sort) ? sort! : "relevance",
  };
}

function writeUrl(f: Filters) {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set("q", f.query.trim());
  if (f.neighbourhoods.length) p.set("n", f.neighbourhoods.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.sort !== "relevance") p.set("sort", f.sort);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

export function CafeExplorer({ cafes, featured = [], autoFocus }: Props) {
  const index = useMemo(() => cafes.map(indexCafe), [cafes]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [visible, setVisible] = useState(PAGE);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Restore state from the URL (?q=matcha&n=Chinatown&type=Korean%20Cafe&sort=az)
  useEffect(() => {
    setFilters((f) => ({ ...f, ...readUrl() }));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeUrl(filters);
  }, [filters, ready]);

  const deferred = useDeferredValue(filters);
  const stale = deferred !== filters;
  const hits = useMemo(() => applyFilters(index, deferred), [index, deferred]);

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

  const activeFilterCount = filters.neighbourhoods.length + filters.types.length;
  const idle = !filters.query.trim() && activeFilterCount === 0;
  const shown = hits.slice(0, visible);

  const runQuickSearch = (q: string) => {
    update({ query: q, sort: "relevance" });
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Close filter popovers on outside click / Escape.
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-popover][open]").forEach((d) => {
        if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <div>
      {/* ——— Search ——— */}
      <form role="search" onSubmit={(e) => { e.preventDefault(); inputRef.current?.blur(); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
        <label htmlFor="cafe-search" className="sr-only">
          Search coffee shops
        </label>
        <div className="relative">
          <Search size={20} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            id="cafe-search"
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

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Quick searches">
        {QUICK_SEARCHES.map((q) => {
          const active = filters.query.trim().toLowerCase() === q.toLowerCase();
          return (
            <button
              key={q}
              type="button"
              aria-pressed={active}
              onClick={() => (active ? update({ query: "" }) : runQuickSearch(q))}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                active ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-ink-2"
              }`}
            >
              {q}
            </button>
          );
        })}
      </div>

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
            {idle ? "All cafes" : "Results"}
          </h2>
          <p className="text-sm text-muted" aria-live="polite" aria-atomic="true">
            {hits.length} {hits.length === 1 ? "cafe" : "cafes"} found
          </p>
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
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="sort" className="text-muted">
              Sort
            </label>
            <select
              id="sort"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              className="border border-line bg-paper px-2 py-2 outline-none hover:border-ink-2 focus:border-ink"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

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
            <button type="button" onClick={() => setMobileFilters(false)} className="bg-ink py-3 text-sm text-paper">
              Show {hits.length} {hits.length === 1 ? "cafe" : "cafes"}
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
            <button
              type="button"
              onClick={() => update({ query: "", neighbourhoods: [], types: [] })}
              className="link-quiet ml-1 text-muted hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}

        <div aria-busy={stale} className={`transition-opacity ${stale ? "opacity-50" : ""}`}>
          {hits.length === 0 ? (
            <EmptyState query={filters.query} hasFilters={activeFilterCount > 0} onPick={runQuickSearch} onReset={() => update({ query: "", neighbourhoods: [], types: [] })} />
          ) : (
            <>
              <ul className="mt-8 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((h, i) => (
                  <li key={h.cafe.id}>
                    <CafeCard cafe={h.cafe} highlights={filters.query ? h.highlights : []} priority={idle && featured.length === 0 && i < 3} />
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

function FilterMenu({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <details data-popover className="relative">
      <summary className={`inline-flex cursor-pointer select-none items-center gap-1.5 border px-3 py-2 hover:border-ink-2 ${count ? "border-ink" : "border-line"}`}>
        {label}
        {count > 0 && <span className="tabular-nums">({count})</span>}
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-64 border border-line bg-paper p-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">{children}</div>
    </details>
  );
}

function CheckList({
  options,
  selected,
  onToggle,
  name,
  columns,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  name: string;
  columns?: boolean;
}) {
  return (
    <ul className={columns ? "grid grid-cols-2 gap-x-4" : ""}>
      {options.map((o) => {
        const id = `${name}-${o.replace(/\W+/g, "-")}`;
        return (
          <li key={o}>
            <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
              <input id={id} type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} className="h-4 w-4 accent-[#161616]" />
              {o === "Other" ? "Other neighbourhoods" : o}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 border border-line bg-wash py-1 pl-2.5 pr-1">
      {label}
      <button type="button" onClick={onRemove} className="p-0.5 text-muted hover:text-ink" aria-label={`Remove ${label}`}>
        <X size={14} strokeWidth={1.5} />
      </button>
    </span>
  );
}

function EmptyState({ query, hasFilters, onPick, onReset }: { query: string; hasFilters: boolean; onPick: (q: string) => void; onReset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-lg font-medium">
        {query.trim() ? <>No cafes match &ldquo;{query.trim()}&rdquo;{hasFilters ? " with these filters" : ""}.</> : "No cafes match these filters yet."}
      </p>
      <p className="mt-2 text-muted">
        Try a broader term, check the spelling, or remove a filter. You can search by drink, food, cuisine or neighbourhood.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {["Matcha", "Croissant", "Vietnamese", "Kensington Market", "Cold brew"].map((q) => (
          <button key={q} type="button" onClick={() => onPick(q)} className="border border-line px-3 py-1.5 text-sm hover:border-ink-2">
            {q}
          </button>
        ))}
      </div>
      <button type="button" onClick={onReset} className="link-quiet mt-6 text-sm">
        Clear search and filters
      </button>
    </div>
  );
}
