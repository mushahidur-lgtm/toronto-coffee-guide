"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, LocateFixed, Search as SearchIcon, X } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { applyFilters, indexCafe, type Filters } from "@/lib/search";
import { EXPLORER_CATEGORIES, type ExplorerCategory } from "@/lib/explorer";
import type { VenueType } from "@/lib/venue";
import { EMPTY_MAP_STATE, inBbox, mapStateToParams, movedSignificantly, parseMapState, type Bbox, type MapState } from "@/lib/map-state";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import { hoursSummary } from "@/lib/hours";
import type { LatLng } from "@/lib/geo";
import { usePopoverDismiss } from "../FilterControls";
import { QuickFilterBar } from "./QuickFilterBar";
import { CafeList } from "./CafeList";
import { BottomSheet, type Snap } from "./BottomSheet";
import { LOCATION_ATTRIBUTION, positionOf, useMediaQuery, type CanvasProps, type MapCommand, type Selection, type SelectSource, type ViewportReport } from "./shared";

const LeafletMapCanvas = dynamic(() => import("./LeafletMapCanvas"), { ssr: false });

type GeoState = "idle" | "locating" | "denied" | "unavailable";

interface Props {
  cafes: CafeView[];
}

/**
 * /map explorer: quick-filter bar, list ↔ map sync, clustering, "Search this area", URL state with
 * Back/Forward, split view on desktop and a bottom sheet on mobile.
 */
export function MapExplorer({ cafes }: Props) {
  usePopoverDismiss();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const index = useMemo(() => cafes.map(indexCafe), [cafes]);
  const byId = useMemo(() => new Map(cafes.map((c) => [c.id, c])), [cafes]);
  const bySlug = useMemo(() => new Map(cafes.map((c) => [c.slug, c])), [cafes]);
  const positions = useMemo(() => new Map(cafes.map((c) => [c.id, positionOf(c)])), [cafes]);

  const [state, setState] = useState<MapState>(EMPTY_MAP_STATE);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<Selection>({ id: null, source: "url", seq: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [command, setCommand] = useState<MapCommand | null>(null);
  /** The area the current results were last searched/fitted for; "Search this area" appears when the map leaves it. */
  const baseline = useRef<Bbox | null>(null);
  const [current, setCurrent] = useState<Bbox | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");
  const [snap, setSnap] = useState<Snap>("peek");
  const [now, setNow] = useState(() => new Date());
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);
  const next = () => ++seq.current;

  // ---- URL ---------------------------------------------------------------------------------
  const writeUrl = useCallback((s: MapState, how: "push" | "replace") => {
    const qs = mapStateToParams(s).toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    if (how === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const applyUrlState = useCallback(
    (source: SelectSource) => {
      const parsed = parseMapState(new URLSearchParams(window.location.search));
      const sel = parsed.selected ? bySlug.get(parsed.selected) ?? null : null;
      if (!sel) parsed.selected = null;
      setState(parsed);
      setSelection({ id: sel?.id ?? null, source, seq: next() });
      setCommand(parsed.view ? { kind: "view", seq: next(), view: parsed.view } : sel ? null : { kind: "fit", seq: next() });
      baseline.current = parsed.bbox;
      setShowSearchArea(false);
    },
    [bySlug],
  );

  useEffect(() => {
    applyUrlState("url");
    setReady(true);
    const onPop = () => applyUrlState("history");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyUrlState]);

  /** Change state; filters/selection push a history entry, typing in search replaces it. */
  const commit = (patch: Partial<MapState>, how: "push" | "replace" = "push", refit = true) => {
    const s = { ...stateRef.current, ...patch };
    setState(s);
    writeUrl(s, how);
    if (refit && !s.bbox) setCommand({ kind: "fit", seq: next() });
  };

  // ---- filtering ----------------------------------------------------------------------------
  useEffect(() => {
    if (!state.filters.openNow) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [state.filters.openNow]);

  // Not deferred: with ~100 cafes filtering is instant, and the map must fit to the same results it shows.
  const results = useMemo(() => {
    const s = state;
    return applyFilters(index, { ...s.filters, sort: s.filters.query.trim() ? "relevance" : "az" }, now)
      .map((h) => h.cafe)
      .filter((c) => !s.categories.length || s.categories.some((k) => c.attributes.categories.includes(k)))
      .filter((c) => !s.laptop || c.attributes.laptopFriendly === true)
      .filter((c) => !s.patio || c.attributes.hasPatio === true)
      .filter((c) => {
        if (!s.bbox) return true;
        const p = positions.get(c.id);
        return !!p && inBbox(s.bbox, p);
      });
  }, [index, state, now, positions]);
  const visibleIds = useMemo(() => new Set(results.map((c) => c.id)), [results]);
  const unplaced = useMemo(() => new Set(results.filter((c) => !positions.get(c.id)).map((c) => c.id)), [results, positions]);
  /** Results drawn at their neighbourhood centre because we have no confirmed address for them. */
  const approximate = useMemo(() => results.filter((c) => positions.get(c.id)?.approximate).length, [results, positions]);

  const venueCounts = useMemo(() => {
    const counts: Record<VenueType, number> = { "specialty-cafe": 0, "tea-matcha": 0, "restaurant-coffee": 0 };
    for (const c of cafes) counts[c.venue_type]++;
    return counts;
  }, [cafes]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(EXPLORER_CATEGORIES.map((c) => [c.slug, 0])) as Record<ExplorerCategory, number>;
    for (const c of cafes) for (const k of c.attributes.categories) counts[k]++;
    return counts;
  }, [cafes]);

  // ---- selection / hover ------------------------------------------------------------------------
  const select = useCallback(
    (id: string | null, source: SelectSource) => {
      const slug = id ? byId.get(id)?.slug ?? null : null;
      const s = { ...stateRef.current, selected: slug };
      setState(s);
      writeUrl(s, "push");
      setSelection({ id, source, seq: next() });
      if (id && source === "map") setSnap((v) => (v === "peek" ? "half" : v));
    },
    [byId, writeUrl],
  );
  const onMapSelect = useCallback((id: string | null) => select(id, "map"), [select]);
  const onListSelect = useCallback((id: string) => select(id, "list"), [select]);

  // ---- viewport + "Search this area" -------------------------------------------------------------
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onViewport = useCallback(
    (v: ViewportReport) => {
      setCurrent(v.bbox);
      if (!v.user || !baseline.current) {
        baseline.current = v.bbox; // our own move (fit, pan to a pick, back/forward) resets the reference area
        setShowSearchArea(false);
      } else {
        setShowSearchArea(movedSignificantly(baseline.current, v.bbox));
      }
      clearTimeout(urlTimer.current);
      urlTimer.current = setTimeout(() => {
        const s = { ...stateRef.current, view: v.view };
        stateRef.current = s;
        setState(s);
        writeUrl(s, "replace"); // viewport moves don't create history entries
      }, 350);
    },
    [writeUrl],
  );
  useEffect(() => () => clearTimeout(urlTimer.current), []);

  const searchThisArea = () => {
    if (!current) return;
    baseline.current = current;
    setShowSearchArea(false);
    commit({ bbox: current }, "push", false);
  };

  // ---- Near me ---------------------------------------------------------------------------------
  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return setGeo("unavailable");
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("idle");
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  // ---- filter handlers ---------------------------------------------------------------------------
  const setFilters = (patch: Partial<Filters>, how: "push" | "replace" = "push") =>
    commit({ filters: { ...stateRef.current.filters, ...patch }, selected: null }, how);
  const toggleList = (key: "neighbourhoods" | "types", value: string) => {
    const cur = stateRef.current.filters[key];
    setFilters({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  const toggleCategory = (c: ExplorerCategory) => {
    const cur = stateRef.current.categories;
    commit({ categories: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c], selected: null });
  };
  const toggle = (key: "openNow" | "laptop" | "patio") => {
    if (key === "openNow") setFilters({ openNow: !stateRef.current.filters.openNow });
    else commit({ [key]: !stateRef.current[key], selected: null });
  };
  const clearAll = () =>
    commit({ filters: { ...EMPTY_MAP_STATE.filters }, categories: [], laptop: false, patio: false, bbox: null, selected: null });

  // Deselect when the selected cafe gets filtered out.
  useEffect(() => {
    if (selection.id && ready && !visibleIds.has(selection.id) && selection.source !== "url" && selection.source !== "history") {
      setSelection({ id: null, source: "list", seq: next() });
    }
  }, [visibleIds, selection, ready]);

  const selectedCafe = selection.id ? byId.get(selection.id) ?? null : null;
  const canvasProps: CanvasProps = {
    cafes,
    visibleIds,
    selection,
    hoveredId,
    command,
    userLoc,
    now,
    onSelect: onMapSelect,
    onViewport,
  };

  const countLine = (
    <p className="text-sm text-muted" aria-live="polite">
      <span className="font-medium text-ink">{results.length}</span> {results.length === 1 ? "place" : "places"}
      {unplaced.size > 0 && <> · {unplaced.size} not on the map</>}
      {approximate > 0 && <> · {approximate} approximate</>}
      {state.bbox && <> · in this area</>}
    </p>
  );

  const list = (
    <CafeList
      cafes={results}
      selection={selection}
      hoveredId={hoveredId}
      now={now}
      unplaced={unplaced}
      onHover={setHoveredId}
      onSelect={onListSelect}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <QuickFilterBar
        state={state}
        categoryCounts={categoryCounts}
        venueCounts={venueCounts}
        onVenue={(v) => setFilters({ venue: v })}
        onQuery={(q) => setFilters({ query: q }, "replace")}
        onToggleCategory={toggleCategory}
        onToggle={toggle}
        onToggleList={toggleList}
        onClearArea={() => commit({ bbox: null })}
        onClearAll={clearAll}
      />

      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[1fr_380px] lg:grid-cols-[1fr_420px]">
        {isDesktop && (
          <aside className="hidden min-h-0 flex-col border-l border-line md:order-last md:flex" aria-label="Cafe list">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">{countLine}</div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{list}</div>
          </aside>
        )}

        <div className="relative h-full min-h-0">
          <LeafletMapCanvas {...canvasProps} />

          {/* Floating controls */}
          {showSearchArea && (
            <button
              type="button"
              onClick={searchThisArea}
              className="absolute left-1/2 top-3 z-[500] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:bg-[#2b2b2b]"
            >
              <SearchIcon size={14} strokeWidth={2} aria-hidden /> Search this area
            </button>
          )}
          <button
            type="button"
            onClick={locate}
            disabled={geo === "locating"}
            aria-label="Show my location"
            className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 border border-line bg-paper px-3 py-2 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:border-ink-2 disabled:opacity-60"
          >
            <LocateFixed size={15} strokeWidth={1.5} aria-hidden />
            <span className="hidden sm:inline">{geo === "locating" ? "Locating…" : "Near me"}</span>
          </button>
          {(geo === "denied" || geo === "unavailable") && (
            <p role="status" className="absolute inset-x-3 top-14 z-[500] mx-auto flex max-w-sm items-start gap-2 border border-line bg-paper p-3 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
              <span className="flex-1">
                {geo === "denied" ? "Location access was declined. Allow location for this site to use Near me." : "We couldn't get your location. Try again in a moment."}
              </span>
              <button type="button" onClick={() => setGeo("idle")} aria-label="Dismiss" className="text-muted hover:text-ink">
                <X size={14} strokeWidth={1.5} />
              </button>
            </p>
          )}
          <p className="pointer-events-none absolute bottom-12 left-2 z-[500] hidden max-w-xs bg-paper/90 px-2 py-1 text-[11px] text-muted md:block">
            Numbers group nearby cafes; zoom in to split them. Hollow dashed markers sit at the neighbourhood centre because we have no confirmed address.
          </p>
        </div>

        {!isDesktop && (
          <BottomSheet
            snap={snap}
            onSnap={setSnap}
            header={
              selectedCafe && snap !== "full" ? (
                <SelectedSummary cafe={selectedCafe} now={now} onClose={() => select(null, "list")} />
              ) : (
                countLine
              )
            }
          >
            {list}
          </BottomSheet>
        )}
      </div>
    </div>
  );
}

/** Compact selected-cafe header for the mobile sheet. */
function SelectedSummary({ cafe, now, onClose }: { cafe: CafeView; now: Date; onClose: () => void }) {
  const hs = hoursSummary(cafe, now);
  return (
    <div className="flex items-start gap-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{cafe.neighbourhood}</p>
        <p className="truncate font-semibold">{cafe.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
          <span className={hs.open ? "font-medium text-[#2f5a24]" : "text-ink-2"}>{hs.text}</span>
        </p>
        <p className="mt-1.5 flex gap-4 text-sm">
          <Link href={`/cafes/${encodeURIComponent(cafe.slug)}`} className="link-quiet">
            View cafe
          </Link>
          <a href={googleMapsDirectionsUrl(cafe.name, cafe.address, cafe.google_place_id)} target="_blank" rel="noopener noreferrer" className="link-quiet inline-flex items-center gap-0.5">
            Directions <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />
          </a>
        </p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-muted hover:text-ink">
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
