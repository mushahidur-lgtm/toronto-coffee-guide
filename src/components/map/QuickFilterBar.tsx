"use client";

import { Clock, Laptop, Search, Sun, X } from "lucide-react";
import { CAFE_TYPES } from "@/lib/types";
import { FILTER_NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { EXPLORER_CATEGORIES, type ExplorerCategory } from "@/lib/explorer";
import { VENUE_TYPES, type VenueType } from "@/lib/venue";
import type { MapState } from "@/lib/map-state";
import { CheckList, Chip, FilterMenu } from "../FilterControls";

interface Props {
  state: MapState;
  categoryCounts: Record<ExplorerCategory, number>;
  onQuery: (q: string) => void;
  onToggleCategory: (c: ExplorerCategory) => void;
  onToggle: (key: "openNow" | "laptop" | "patio") => void;
  onToggleList: (key: "neighbourhoods" | "types", value: string) => void;
  venueCounts: Record<VenueType, number>;
  onVenue: (v: VenueType | null) => void;
  onClearArea: () => void;
  onClearAll: () => void;
}

const pill = (active: boolean, disabled = false) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-sm transition-colors ${
    disabled
      ? "cursor-not-allowed border-line text-[#a3a3a3]"
      : active
        ? "border-ink bg-ink text-paper"
        : "border-line bg-paper text-ink-2 hover:border-ink-2"
  }`;

/** Search, area/type menus, and a horizontally scrollable row of category + attribute pills. */
export function QuickFilterBar({ state, categoryCounts, venueCounts, onVenue, onQuery, onToggleCategory, onToggle, onToggleList, onClearArea, onClearAll }: Props) {
  const f = state.filters;
  const anyActive =
    !!f.query.trim() || f.neighbourhoods.length > 0 || f.types.length > 0 || f.openNow || !!f.venue || state.categories.length > 0 || state.laptop || state.patio || !!state.bbox;

  return (
    <div className="shrink-0 border-b border-line bg-paper">
      <div className="flex items-center gap-2 px-4 pt-3 sm:px-6">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <label htmlFor="map-q" className="sr-only">
            Search cafes
          </label>
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="map-q"
            type="search"
            value={f.query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search matcha, croissant, Kensington…"
            className="h-10 w-full border border-line bg-paper pl-9 pr-3 text-sm outline-none hover:border-ink-2 focus:border-ink [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <FilterMenu label="Area" count={f.neighbourhoods.length} align="right">
          <CheckList options={[...FILTER_NEIGHBOURHOODS]} selected={f.neighbourhoods} onToggle={(v) => onToggleList("neighbourhoods", v)} name="mq-n" />
        </FilterMenu>
        <FilterMenu label="Type" count={f.types.length} align="right">
          <CheckList options={[...CAFE_TYPES]} selected={f.types} onToggle={(v) => onToggleList("types", v)} name="mq-t" />
        </FilterMenu>
      </div>

      {/* Scrollable pills. The fade on the right hints there's more. */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Quick filters">
          {VENUE_TYPES.map((v) => {
            const active = f.venue === v.slug;
            return (
              <button key={v.slug} type="button" aria-pressed={active} title={v.hint} onClick={() => onVenue(active ? null : v.slug)} className={pill(active)}>
                {v.short}
                <span className={`tabular-nums ${active ? "text-paper/70" : "text-muted"}`}>{venueCounts[v.slug]}</span>
              </button>
            );
          })}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          <button type="button" aria-pressed={f.openNow} onClick={() => onToggle("openNow")} className={pill(f.openNow)}>
            <Clock size={14} strokeWidth={1.5} aria-hidden /> Open now
          </button>
          <button type="button" aria-pressed={state.laptop} onClick={() => onToggle("laptop")} className={pill(state.laptop)}>
            <Laptop size={14} strokeWidth={1.5} aria-hidden /> Laptop friendly
          </button>
          <button type="button" aria-pressed={state.patio} onClick={() => onToggle("patio")} className={pill(state.patio)}>
            <Sun size={14} strokeWidth={1.5} aria-hidden /> Patio
          </button>
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          {EXPLORER_CATEGORIES.map((c) => {
            const active = state.categories.includes(c.slug);
            const count = categoryCounts[c.slug] ?? 0;
            const disabled = count === 0 && !active;
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? `${c.label}: none listed yet` : c.hint}
                onClick={() => onToggleCategory(c.slug)}
                className={pill(active, disabled)}
              >
                {c.label}
                <span className={`tabular-nums ${active ? "text-paper/70" : "text-muted"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper" aria-hidden />
      </div>

      {anyActive && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-sm sm:px-6">
          {f.neighbourhoods.map((n) => (
            <Chip key={n} label={n} onRemove={() => onToggleList("neighbourhoods", n)} />
          ))}
          {f.types.map((t) => (
            <Chip key={t} label={t} onRemove={() => onToggleList("types", t)} />
          ))}
          {state.bbox && <Chip label="This map area" onRemove={onClearArea} />}
          <button type="button" onClick={onClearAll} className="inline-flex items-center gap-1 text-muted hover:text-ink">
            <X size={14} strokeWidth={1.5} aria-hidden /> Clear all
          </button>
        </div>
      )}
    </div>
  );
}
