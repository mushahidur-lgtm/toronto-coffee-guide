"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Clock, LocateFixed, Search, SlidersHorizontal, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { CafeView } from "@/lib/types";
import { CAFE_TYPES } from "@/lib/types";
import { FILTER_NEIGHBOURHOODS, getNeighbourhood, NEIGHBOURHOODS } from "@/lib/neighbourhoods";
import { applyFilters, EMPTY_FILTERS, filtersFromParams, filtersToParams, indexCafe, type Filters } from "@/lib/search";
import { isOpenNow, todayHoursText } from "@/lib/hours";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import { cafeLocation, type LatLng } from "@/lib/geo";
import { CheckList, Chip, FilterMenu, usePopoverDismiss } from "./FilterControls";

/**
 * /map: filter bar + map.
 *  - Google mode (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY + NEXT_PUBLIC_GOOGLE_MAP_ID): AdvancedMarkerElement pins,
 *    marker clustering, one shared InfoWindow card. google_location is only present in this mode
 *    (the server strips it otherwise, per Google Maps Platform terms).
 *  - Leaflet/OpenStreetMap fallback: neighbourhood-level circles from our own data.
 * Filters live in the URL (?q=&n=&type=&open=1) and ?cafe=<slug> opens a cafe's card.
 * Changing filters shows/hides markers; the map itself is created once.
 */

const TORONTO: LatLng = { lat: 43.6839, lng: -79.39 };
const COFFEE = "#7a4b2a";
const ESPRESSO = "#3b2416";

type GeoState = "idle" | "locating" | "ready" | "denied" | "unavailable";

export type MapMode = "google" | "leaflet";

interface Props {
  cafes: CafeView[];
  mode: MapMode;
}

// ---------------------------------------------------------------------------
// HTML helpers (InfoWindow / popup content is an HTML string; escape everything)
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cafeHref = (slug: string) => `/cafes/${encodeURIComponent(slug)}`;

function cardHtml(c: CafeView, now: Date): string {
  const hours = todayHoursText(c.opening_hours, now);
  const open = isOpenNow(c.opening_hours, now);
  const badge =
    open === true
      ? `<span style="background:#161616;color:#fff;padding:1px 6px;font-size:11px;font-weight:600">Open now</span>`
      : open === false
        ? `<span style="border:1px solid #cfcfcf;color:#6b6b6b;padding:0 6px;font-size:11px">Closed</span>`
        : "";
  const types = Array.from(new Set(c.cafe_categories)).slice(0, 3).join(" · ");
  const directions = googleMapsDirectionsUrl(c.name, c.address, c.google_place_id);
  return `<div style="font:13px/1.45 var(--font-inter),system-ui,sans-serif;color:#161616;min-width:200px;max-width:260px;padding:2px 2px 4px">
    <a href="${esc(cafeHref(c.slug))}" style="display:block;font-size:15px;font-weight:600;color:#161616;text-decoration:none;line-height:1.25">${esc(c.name)}</a>
    <div style="margin-top:3px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b">${esc(c.neighbourhood)}</div>
    ${types ? `<div style="margin-top:4px;color:#3d3d3d">${esc(types)}</div>` : ""}
    <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${badge}<span style="color:#3d3d3d">${
      hours ? `Today: ${esc(hours)}` : "Hours not listed"
    }</span></div>
    <div style="margin-top:10px;display:flex;gap:14px">
      <a href="${esc(cafeHref(c.slug))}" style="color:#161616">View cafe</a>
      <a href="${esc(directions)}" target="_blank" rel="noopener noreferrer" style="color:#161616">Directions ↗</a>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Filter bar + state
// ---------------------------------------------------------------------------

export function MapView({ cafes, mode }: Props) {
  const index = useMemo(() => cafes.map(indexCafe), [cafes]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [focus, setFocus] = useState<string | null>(null);
  /** Cafe from ?cafe= : kept on the map even if filters would hide it, until filters change. */
  const [pinned, setPinned] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [geo, setGeo] = useState<GeoState>("idle");
  usePopoverDismiss();

  // Read ?q=&n=&type=&open=1&cafe= once.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFilters(filtersFromParams((k) => p.get(k)));
    const slug = p.get("cafe");
    if (slug && cafes.some((c) => c.slug === slug)) {
      setFocus(slug);
      setPinned(slug);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL shareable.
  useEffect(() => {
    if (!ready) return;
    const p = filtersToParams({ ...filters, sort: "relevance" });
    if (focus) p.set("cafe", focus);
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [filters, focus, ready]);

  useEffect(() => {
    if (!filters.openNow) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [filters.openNow]);

  const deferred = useDeferredValue(filters);
  const visible = useMemo(
    () => new Set(applyFilters(index, { ...deferred, sort: "az" }, now).map((h) => h.cafe.id)),
    [index, deferred, now],
  );
  const located = useMemo(() => cafes.filter((c) => visible.has(c.id) && cafeLocation(c)).length, [cafes, visible]);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setFocus(null);
    setPinned(null);
    setFitKey((k) => k + 1); // re-fit to the filtered pins
  };
  const toggle = (key: "neighbourhoods" | "types", value: string) => {
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
    setFocus(null);
    setPinned(null);
    setFitKey((k) => k + 1);
  };
  const activeCount = filters.neighbourhoods.length + filters.types.length + (filters.openNow ? 1 : 0) + (filters.query.trim() ? 1 : 0);
  const clearAll = () => update({ query: "", neighbourhoods: [], types: [], openNow: false });

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return setGeo("unavailable");
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("ready");
      },
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const controls = (prefix: string, stacked: boolean) => (
    <>
      <div className={`relative ${stacked ? "w-full" : "w-56 lg:w-64"}`}>
        <label htmlFor={`${prefix}-q`} className="sr-only">
          Search cafes on the map
        </label>
        <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={`${prefix}-q`}
          type="search"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search matcha, croissant…"
          className="h-10 w-full border border-line bg-paper pl-9 pr-3 text-sm outline-none hover:border-ink-2 focus:border-ink [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {stacked ? (
        <>
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Neighbourhood</legend>
            <CheckList options={[...FILTER_NEIGHBOURHOODS]} selected={filters.neighbourhoods} onToggle={(v) => toggle("neighbourhoods", v)} name={`${prefix}-n`} columns />
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Cafe type</legend>
            <CheckList options={[...CAFE_TYPES]} selected={filters.types} onToggle={(v) => toggle("types", v)} name={`${prefix}-t`} columns />
          </fieldset>
        </>
      ) : (
        <>
          <FilterMenu label="Neighbourhood" count={filters.neighbourhoods.length}>
            <CheckList options={[...FILTER_NEIGHBOURHOODS]} selected={filters.neighbourhoods} onToggle={(v) => toggle("neighbourhoods", v)} name={`${prefix}-n`} />
          </FilterMenu>
          <FilterMenu label="Cafe type" count={filters.types.length}>
            <CheckList options={[...CAFE_TYPES]} selected={filters.types} onToggle={(v) => toggle("types", v)} name={`${prefix}-t`} />
          </FilterMenu>
        </>
      )}
      <button
        type="button"
        aria-pressed={filters.openNow}
        onClick={() => update({ openNow: !filters.openNow })}
        className={`inline-flex h-10 items-center gap-1.5 border px-3 text-sm ${filters.openNow ? "border-ink bg-ink text-paper" : "border-line hover:border-ink-2"}`}
      >
        <Clock size={14} strokeWidth={1.5} aria-hidden /> Open now
      </button>
    </>
  );

  return (
    <div>
      {/* Filter bar: inline on desktop, collapsible on mobile */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3 text-sm">
        <div className="hidden flex-wrap items-center gap-2 md:flex">{controls("d", false)}</div>
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          aria-controls="map-filters"
          className="inline-flex h-10 items-center gap-2 border border-line px-3 md:hidden"
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
        <button
          type="button"
          onClick={locate}
          disabled={geo === "locating"}
          className="inline-flex h-10 items-center gap-1.5 border border-line px-3 hover:border-ink-2 disabled:opacity-60"
        >
          <LocateFixed size={15} strokeWidth={1.5} aria-hidden />
          {geo === "locating" ? "Locating…" : "Near me"}
        </button>
        <p className="ml-auto text-muted" aria-live="polite">
          {visible.size} {visible.size === 1 ? "cafe" : "cafes"}
          {mode === "google" && located < visible.size ? ` · ${visible.size - located} not on the map` : ""}
        </p>
      </div>

      {panelOpen && (
        <div id="map-filters" className="grid gap-5 border-b border-line py-4 text-sm md:hidden">
          {controls("m", true)}
          <button type="button" onClick={() => setPanelOpen(false)} className="bg-ink py-3 text-paper">
            Show {visible.size} {visible.size === 1 ? "cafe" : "cafes"}
          </button>
        </div>
      )}

      {(activeCount > 0 || geo === "denied" || geo === "unavailable") && (
        <div className="flex flex-wrap items-center gap-2 py-3 text-sm">
          {filters.query.trim() && <Chip label={`“${filters.query.trim()}”`} onRemove={() => update({ query: "" })} />}
          {filters.neighbourhoods.map((n) => (
            <Chip key={n} label={n} onRemove={() => toggle("neighbourhoods", n)} />
          ))}
          {filters.types.map((t) => (
            <Chip key={t} label={t} onRemove={() => toggle("types", t)} />
          ))}
          {filters.openNow && <Chip label="Open now" onRemove={() => update({ openNow: false })} />}
          {activeCount > 0 && (
            <button type="button" onClick={clearAll} className="link-quiet text-muted hover:text-ink">
              Clear all
            </button>
          )}
          {(geo === "denied" || geo === "unavailable") && (
            <span role="status" className="basis-full text-muted">
              {geo === "denied"
                ? "Location access was declined. Allow location for this site in your browser to use Near me."
                : "We couldn't get your location. Try again in a moment."}
              <button type="button" onClick={() => setGeo("idle")} className="ml-2 align-middle text-muted hover:text-ink" aria-label="Dismiss">
                <X size={14} strokeWidth={1.5} />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="-mx-4 mt-3 sm:mx-0">
        {mode === "google" ? (
          <GoogleCanvas cafes={cafes} visible={visible} pinned={pinned} onFocus={setFocus} fitKey={fitKey} userLoc={userLoc} now={now} ready={ready} />
        ) : (
          <LeafletCanvas cafes={cafes} visible={visible} pinned={pinned} userLoc={userLoc} ready={ready} />
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        {mode === "google"
          ? "Pins show cafe locations from Google Maps; numbered circles group nearby cafes. Click a pin for details."
          : "Circles group cafes by neighbourhood (size = number of cafes). Click one to see its cafes. Add a Google Maps browser key and Map ID for exact pins."}
      </p>
    </div>
  );
}

const MAP_BOX = "isolate z-0 h-[75vh] min-h-[420px] w-full border-y border-line bg-wash sm:border";

// ---------------------------------------------------------------------------
// Google Maps (AdvancedMarkerElement + MarkerClusterer + one shared InfoWindow)
// ---------------------------------------------------------------------------

let optionsSet = false;

interface CanvasProps {
  cafes: CafeView[];
  visible: Set<string>;
  /** Slug from ?cafe= : always shown, and centred + opened on load. */
  pinned: string | null;
  userLoc: LatLng | null;
  ready: boolean;
}

function GoogleCanvas({
  cafes,
  visible,
  pinned,
  onFocus,
  fitKey,
  userLoc,
  now,
  ready,
}: CanvasProps & { onFocus: (slug: string | null) => void; fitKey: number; now: Date }) {
  const el = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = useRef<{
    map: google.maps.Map;
    info: google.maps.InfoWindow;
    markers: Map<string, google.maps.marker.AdvancedMarkerElement>;
    clusterer: import("@googlemaps/markerclusterer").MarkerClusterer;
    Advanced: typeof google.maps.marker.AdvancedMarkerElement;
    user?: google.maps.marker.AdvancedMarkerElement;
  } | null>(null);
  const byId = useMemo(() => new Map(cafes.map((c) => [c.id, c])), [cafes]);
  const bySlug = useMemo(() => new Map(cafes.map((c) => [c.slug, c])), [cafes]);
  const nowRef = useRef(now);
  nowRef.current = now;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  // Create the map, markers and clusterer once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY!;
        const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!;
        const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
        if (!optionsSet) {
          setOptions({ key, v: "weekly", language: "en", region: "CA", mapIds: [mapId] });
          optionsSet = true;
        }
        const [{ Map: GMap, InfoWindow }, { AdvancedMarkerElement, PinElement }, mc] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
          import("@googlemaps/markerclusterer"),
        ]);
        if (cancelled || !el.current) return;

        const map = new GMap(el.current, {
          center: TORONTO,
          zoom: 11,
          mapId,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        const info = new InfoWindow({ maxWidth: 300 });
        info.addListener("closeclick", () => onFocusRef.current(null));

        const markers = new Map<string, google.maps.marker.AdvancedMarkerElement>();
        for (const c of cafes) {
          const pos = c.google_location ?? cafeLocation(c);
          if (!pos) continue;
          const pin = new PinElement(
            c.featured
              ? { background: ESPRESSO, borderColor: "#1c110a", glyphColor: "#e9c46a", scale: 1.2 }
              : { background: COFFEE, borderColor: ESPRESSO, glyphColor: "#f6efe8", scale: 1 },
          );
          const marker = new AdvancedMarkerElement({
            position: pos,
            content: pin, // PinElement is itself an HTMLElement (.element is deprecated)
            title: c.featured ? `${c.name} (featured)` : c.name,
            gmpClickable: true,
            zIndex: c.featured ? 2 : 1,
          });
          marker.addEventListener("gmp-click", () => {
            info.setContent(cardHtml(c, nowRef.current));
            info.open({ map, anchor: marker });
            onFocusRef.current(c.slug);
          });
          markers.set(c.id, marker);
        }

        const clusterer = new mc.MarkerClusterer({
          map,
          markers: [],
          algorithm: new mc.SuperClusterAlgorithm({ maxZoom: 15, radius: 70 }),
          renderer: {
            render: ({ count, position }) => {
              const size = count < 10 ? 34 : count < 25 ? 40 : 48;
              const div = document.createElement("div");
              div.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${COFFEE};color:#fff;border:3px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui,sans-serif`;
              div.textContent = String(count);
              return new AdvancedMarkerElement({ position, content: div, title: `${count} cafes: zoom in`, zIndex: 1000 + count });
            },
          },
        });

        g.current = { map, info, markers, clusterer, Advanced: AdvancedMarkerElement };
        setLoaded(true);
      } catch (err) {
        console.error("[map] Google Maps failed to load", err);
        if (!cancelled) setError("The map couldn't load. Check the Google Maps browser key and Map ID.");
      }
    })();
    return () => {
      cancelled = true;
      if (g.current) {
        g.current.clusterer.clearMarkers();
        g.current.info.close();
        g.current = null;
      }
    };
    // Created once; cafes don't change after the page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / hide markers when filters change (the map is not recreated).
  useEffect(() => {
    const s = g.current;
    if (!loaded || !s || !ready) return;
    const shown: google.maps.marker.AdvancedMarkerElement[] = [];
    for (const [id, m] of s.markers) {
      const c = byId.get(id)!;
      if (visible.has(id) || c.slug === pinned) shown.push(m);
    }
    s.clusterer.clearMarkers(true);
    s.clusterer.addMarkers(shown);
  }, [loaded, ready, visible, pinned, byId]);

  // Fit to the visible pins on load and when filters change; ?cafe= centres on that cafe instead.
  const initialFocusDone = useRef(false);
  useEffect(() => {
    const s = g.current;
    if (!loaded || !s || !ready) return;
    if (!initialFocusDone.current) {
      initialFocusDone.current = true;
      const c = pinned ? bySlug.get(pinned) : null;
      const m = c ? s.markers.get(c.id) : null;
      if (c && m && m.position) {
        s.map.setCenter(m.position);
        s.map.setZoom(16);
        s.info.setContent(cardHtml(c, nowRef.current));
        s.info.open({ map: s.map, anchor: m });
        return;
      }
    }
    const pts = [...s.markers].filter(([id]) => visible.has(id)).map(([, m]) => m.position).filter(Boolean) as google.maps.LatLngLiteral[];
    if (!pts.length) {
      s.map.setCenter(TORONTO);
      s.map.setZoom(11);
    } else if (pts.length === 1) {
      s.map.setCenter(pts[0]);
      s.map.setZoom(15);
    } else {
      const b = new google.maps.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      s.map.fitBounds(b, 48);
    }
    s.info.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, ready, fitKey]);

  // "Near me": blue dot + zoom.
  useEffect(() => {
    const s = g.current;
    if (!loaded || !s || !userLoc) return;
    if (!s.user) {
      const dot = document.createElement("div");
      dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.2),0 1px 3px rgba(0,0,0,.35)";
      s.user = new s.Advanced({ map: s.map, position: userLoc, content: dot, title: "You are here", zIndex: 5000 });
    } else {
      s.user.position = userLoc;
    }
    s.map.panTo(userLoc);
    s.map.setZoom(15);
  }, [loaded, userLoc]);

  return (
    <div className="relative">
      <div ref={el} className={MAP_BOX} role="region" aria-label="Map of Toronto cafes" />
      {!loaded && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading map…</p>}
      {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaflet / OpenStreetMap fallback (neighbourhood-level, our own data only)
// ---------------------------------------------------------------------------

function hoodPopup(name: string, list: CafeView[]) {
  const slug = NEIGHBOURHOODS.find((n) => n.name === name)?.slug;
  return `<div style="font:13px/1.45 var(--font-inter),system-ui;min-width:180px">
    <strong style="font-size:14px">${esc(name)}</strong>
    <ul style="margin:6px 0 8px;padding:0;list-style:none">${list
      .map((c) => `<li><a href="${esc(cafeHref(c.slug))}" style="color:#161616">${esc(c.name)}</a></li>`)
      .join("")}</ul>
    ${slug ? `<a href="/neighbourhoods/${encodeURIComponent(slug)}" style="color:#6b6b6b">View neighbourhood →</a>` : ""}
  </div>`;
}

function LeafletCanvas({ cafes, visible, pinned, userLoc, ready }: CanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<{ lib: typeof import("leaflet"); map: import("leaflet").Map; layer: import("leaflet").LayerGroup; user?: import("leaflet").CircleMarker } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const map = lib.map(el.current, { scrollWheelZoom: false }).setView([TORONTO.lat, TORONTO.lng], 11);
      lib.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.current = { lib, map, layer: lib.layerGroup().addTo(map) };
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      L.current?.map.remove();
      L.current = null;
    };
  }, []);

  // Redraw the circles for the visible cafes (map stays).
  const popups = useRef(new Map<string, import("leaflet").CircleMarker>());
  useEffect(() => {
    const s = L.current;
    if (!loaded || !s || !ready) return;
    s.layer.clearLayers();
    popups.current.clear();
    const groups = new Map<string, CafeView[]>();
    for (const c of cafes) {
      if (!visible.has(c.id) && c.slug !== pinned) continue;
      groups.set(c.neighbourhood, [...(groups.get(c.neighbourhood) ?? []), c]);
    }
    for (const [hood, list] of groups) {
      const n = getNeighbourhood(hood);
      if (!n) continue;
      const circle = s.lib
        .circleMarker([n.lat, n.lng], { radius: 7 + Math.sqrt(list.length) * 4, color: "#161616", weight: 1, fillColor: COFFEE, fillOpacity: 0.55 })
        .bindTooltip(`${n.name} · ${list.length}`, { direction: "top" })
        .bindPopup(hoodPopup(n.name, list));
      circle.addTo(s.layer);
      popups.current.set(hood, circle);
    }
  }, [loaded, ready, cafes, visible, pinned]);

  // ?cafe= → open that cafe's neighbourhood.
  const focusDone = useRef(false);
  useEffect(() => {
    const s = L.current;
    if (!loaded || !s || !ready || focusDone.current) return;
    focusDone.current = true;
    const c = pinned ? cafes.find((x) => x.slug === pinned) : null;
    const n = c ? getNeighbourhood(c.neighbourhood) : null;
    if (c && n) {
      s.map.setView([n.lat, n.lng], 14);
      popups.current.get(c.neighbourhood)?.openPopup();
    }
  }, [loaded, ready, pinned, cafes]);

  useEffect(() => {
    const s = L.current;
    if (!loaded || !s || !userLoc) return;
    if (!s.user) {
      s.user = s.lib
        .circleMarker([userLoc.lat, userLoc.lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 })
        .bindTooltip("You are here")
        .addTo(s.map);
    } else {
      s.user.setLatLng([userLoc.lat, userLoc.lng]);
    }
    s.map.setView([userLoc.lat, userLoc.lng], 14);
  }, [loaded, userLoc]);

  return <div ref={el} className={MAP_BOX} role="region" aria-label="Map of Toronto cafes by neighbourhood" />;
}
