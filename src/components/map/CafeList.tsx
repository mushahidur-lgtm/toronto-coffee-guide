"use client";

import Link from "next/link";
import { memo, useEffect, useRef } from "react";
import { ArrowUpRight, Coffee, Laptop, Sun } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { isOpenNow, todayHoursText } from "@/lib/hours";
import { explorerLabel } from "@/lib/explorer";
import { VenueBadge } from "../VenueBadge";
import type { Selection } from "./shared";

interface Props {
  cafes: CafeView[];
  selection: Selection;
  hoveredId: string | null;
  now: Date;
  /** Cafes without a map position (shown with a note). */
  unplaced: Set<string>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

/** Sidebar / bottom-sheet list. Hover highlights the pin; click selects (pans the map). */
export function CafeList({ cafes, selection, hoveredId, now, unplaced, onHover, onSelect }: Props) {
  const refs = useRef(new Map<string, HTMLLIElement>());

  // A pin clicked on the map (or a shared link) scrolls its card into view.
  useEffect(() => {
    if (!selection.id || selection.source === "list") return;
    refs.current.get(selection.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selection]);

  if (!cafes.length) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted">
        <p className="font-medium text-ink">No cafes match.</p>
        <p className="mt-1">Try removing a filter or searching a wider area.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line" onMouseLeave={() => onHover(null)}>
      {cafes.map((c) => (
        <Row
          key={c.id}
          cafe={c}
          selected={selection.id === c.id}
          hovered={hoveredId === c.id}
          now={now}
          unplaced={unplaced.has(c.id)}
          onHover={onHover}
          onSelect={onSelect}
          liRef={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
        />
      ))}
    </ul>
  );
}

const Row = memo(function Row({
  cafe: c,
  selected,
  hovered,
  now,
  unplaced,
  onHover,
  onSelect,
  liRef,
}: {
  cafe: CafeView;
  selected: boolean;
  hovered: boolean;
  now: Date;
  unplaced: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  liRef: (el: HTMLLIElement | null) => void;
}) {
  const open = isOpenNow(c.opening_hours, now);
  const hours = todayHoursText(c.opening_hours, now);
  const a = c.attributes;
  return (
    <li
      ref={liRef}
      onMouseEnter={() => onHover(c.id)}
      className={`relative scroll-my-2 transition-colors ${selected ? "bg-wash" : hovered ? "bg-[#faf9f7]" : ""}`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" aria-hidden />}
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        onFocus={() => onHover(c.id)}
        aria-pressed={selected}
        className="block w-full px-5 py-4 text-left"
      >
        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{c.neighbourhood}</span>
        <span className="mt-1 block font-semibold leading-snug tracking-tight">{c.name}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2">
          <VenueBadge venue={c.venue_type} />
          {a.categories.length > 0 && (
            <span className="truncate text-sm text-muted">{a.categories.slice(0, 2).map(explorerLabel).join(" · ")}</span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {open === true && <span className="bg-ink px-1.5 py-px text-[11px] font-semibold text-paper">Open now</span>}
          {open === false && <span className="border border-line-strong px-1.5 text-[11px] text-muted">Closed</span>}
          <span className="text-ink-2">{hours ? hours : "Hours not listed"}</span>
        </span>
        {(a.laptopFriendly || a.hasPatio || a.roastsInHouse || unplaced) && (
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {a.laptopFriendly && (
              <span className="inline-flex items-center gap-1">
                <Laptop size={12} strokeWidth={1.5} aria-hidden /> Laptop friendly
              </span>
            )}
            {a.hasPatio && (
              <span className="inline-flex items-center gap-1">
                <Sun size={12} strokeWidth={1.5} aria-hidden /> Patio
              </span>
            )}
            {a.roastsInHouse && (
              <span className="inline-flex items-center gap-1">
                <Coffee size={12} strokeWidth={1.5} aria-hidden /> Roasts in house
              </span>
            )}
            {unplaced && <span>Not on the map yet</span>}
          </span>
        )}
      </button>
      <Link
        href={`/cafes/${encodeURIComponent(c.slug)}`}
        className="link-quiet absolute right-5 top-4 inline-flex items-center gap-0.5 text-xs text-muted hover:text-ink"
        aria-label={`${c.name}: cafe page`}
      >
        Details <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />
      </Link>
    </li>
  );
});
