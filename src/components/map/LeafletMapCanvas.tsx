"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { CafeView } from "@/lib/types";
import { COFFEE, INK, LOCATION_ATTRIBUTION, TORONTO, cafeHref, esc, popupHtml, positionOf, type CanvasProps, type MapPoint } from "./shared";

/**
 * Leaflet + OpenStreetMap tiles: no API key, no per-view cost.
 *  - One marker per cafe at its own coordinates. Cafes without a confirmed address sit at their neighbourhood centre
 *    as hollow, dashed markers, never as exact pins.
 *  - Nearby markers merge into numbered clusters (a pixel grid that follows the zoom level). Clicking a cluster zooms
 *    in; at street level, cafes in the same building stay clustered and open a list.
 *  - Selecting a cafe (from the map or the list) highlights its marker and opens a preview card.
 * All listeners are removed on unmount.
 */

type L = typeof import("leaflet");
type LMap = import("leaflet").Map;
type LMarker = import("leaflet").Marker;

interface Item {
  cafe: CafeView;
  pos: MapPoint;
}

interface Group {
  key: string;
  members: Item[];
  lat: number;
  lng: number;
}

interface Store {
  lib: L;
  map: LMap;
  layer: import("leaflet").LayerGroup;
  /** Single-cafe markers by cafe id, and cluster markers by cluster key (for highlight + popups). */
  singles: Map<string, LMarker>;
  clusters: Map<string, { marker: LMarker; group: Group }>;
  user?: import("leaflet").CircleMarker;
  programmatic: boolean;
}

const CELL_PX = 56; // cluster grid size
const STREET_ZOOM = 17; // from here on, only cafes at the very same point stay merged
const DOT = 14;
const HIT = 30; // tap target

function dotHtml(approximate: boolean, active: boolean) {
  const size = active ? DOT + 6 : DOT;
  const fill = approximate ? "rgba(122,75,42,.18)" : active ? INK : COFFEE;
  const border = approximate ? `2px dashed ${COFFEE}` : `2px solid ${active ? "#fff" : "#fff"}`;
  const shadow = active ? "0 0 0 3px rgba(22,22,22,.35)" : approximate ? "none" : "0 1px 3px rgba(0,0,0,.45)";
  return `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:${border};box-shadow:${shadow};box-sizing:border-box"></span>`;
}

function clusterHtml(count: number, active: boolean) {
  const size = count < 10 ? 32 : count < 30 ? 38 : 44;
  return `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${active ? INK : COFFEE};color:#fff;font:600 13px/1 var(--font-inter),system-ui;border:3px solid rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.4);box-sizing:border-box">${count}</span>`;
}

function listPopup(members: Item[], selectedId: string | null) {
  return `<div style="font:13px/1.45 var(--font-inter),system-ui;min-width:190px;max-height:230px;overflow:auto">
    <strong style="font-size:14px">${members.length} places here</strong>
    <ul style="margin:6px 0 0;padding:0;list-style:none">${members
      .map(
        ({ cafe: c }) =>
          `<li style="margin:3px 0"><button type="button" data-cafe="${esc(c.id)}" style="all:unset;cursor:pointer;color:${INK};${c.id === selectedId ? "font-weight:700;text-decoration:underline" : ""}">${esc(c.name)}</button> <a href="${esc(cafeHref(c.slug))}" style="color:#6b6b6b;font-size:12px" aria-label="Open ${esc(c.name)}">↗</a></li>`,
      )
      .join("")}</ul>
  </div>`;
}

export default function LeafletMapCanvas({ cafes, visibleIds, selection, hoveredId, command, userLoc, now, onSelect, onViewport }: CanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const store = useRef<Store | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(12);
  const cb = useRef({ onSelect, onViewport });
  cb.current = { onSelect, onViewport };
  const nowRef = useRef(now);
  nowRef.current = now;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const hoveredRef = useRef(hoveredId);
  hoveredRef.current = hoveredId;
  const byId = useMemo(() => new Map(cafes.map((c) => [c.id, c])), [cafes]);

  // A selected cafe stays on the map even when filtered out; otherwise selecting must not redraw anything.
  const pinned = selection.id && !visibleIds.has(selection.id) ? selection.id : null;
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of cafes) {
      if (!visibleIds.has(c.id) && c.id !== pinned) continue;
      const pos = positionOf(c);
      if (pos) out.push({ cafe: c, pos });
    }
    return out;
  }, [cafes, visibleIds, pinned]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ---- map setup ---------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const map = lib.map(el.current, { zoomControl: true, maxZoom: 19 }).setView([TORONTO.lat, TORONTO.lng], 12);
      lib
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ${LOCATION_ATTRIBUTION.replace(
            "Open Government Licence – Toronto",
            '<a href="https://open.toronto.ca/open-data-licence/" target="_blank" rel="noopener noreferrer">Open Government Licence – Toronto</a>',
          )}`,
        })
        .addTo(map);
      const s: Store = { lib, map, layer: lib.layerGroup().addTo(map), singles: new Map(), clusters: new Map(), programmatic: true };

      map.on("dragstart", () => (s.programmatic = false));
      map.on("moveend", () => {
        const b = map.getBounds();
        const c = map.getCenter();
        cb.current.onViewport({
          bbox: { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() },
          view: { lat: c.lat, lng: c.lng, zoom: map.getZoom() },
          user: !s.programmatic,
        });
        s.programmatic = false;
      });
      map.on("zoomend", () => setZoom(map.getZoom()));
      // Names inside a cluster popup select that cafe.
      map.on("popupopen", (e) => {
        const node = e.popup.getElement();
        if (!node) return;
        node.onclick = (ev) => {
          const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-cafe]")?.dataset.cafe;
          if (id) cb.current.onSelect(id);
        };
      });
      store.current = s;
      setZoom(map.getZoom());
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      const s = store.current;
      if (s) {
        s.map.off();
        s.map.remove();
      }
      store.current = null;
    };
  }, []);

  // ---- draw markers + clusters (when the visible set or the zoom changes) -------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const { lib, map } = s;
    s.layer.clearLayers();
    s.singles.clear();
    s.clusters.clear();

    const z = map.getZoom();
    const cells = new Map<string, Item[]>();
    for (const it of items) {
      const key =
        z >= STREET_ZOOM
          ? `${it.pos.lat.toFixed(5)},${it.pos.lng.toFixed(5)}`
          : (() => {
              const p = map.project([it.pos.lat, it.pos.lng], z);
              return `${Math.floor(p.x / CELL_PX)}:${Math.floor(p.y / CELL_PX)}`;
            })();
      cells.set(key, [...(cells.get(key) ?? []), it]);
    }

    const activeIds = new Set([hoveredRef.current, selectionRef.current.id].filter(Boolean) as string[]);
    for (const [key, members] of cells) {
      if (members.length === 1) {
        const { cafe, pos } = members[0];
        const marker = lib
          .marker([pos.lat, pos.lng], {
            icon: lib.divIcon({ className: "", html: `<span style="display:flex;width:${HIT}px;height:${HIT}px;align-items:center;justify-content:center">${dotHtml(pos.approximate, activeIds.has(cafe.id))}</span>`, iconSize: [HIT, HIT], iconAnchor: [HIT / 2, HIT / 2], popupAnchor: [0, -HIT / 2] }),
            title: pos.approximate ? `${cafe.name} (approximate location)` : cafe.name,
            alt: cafe.name,
            keyboard: true,
            riseOnHover: true,
          })
          .bindPopup(() => popupHtml(cafe, nowRef.current, pos.approximate), { maxWidth: 260, autoPanPadding: [24, 24] });
        marker.on("click", () => {
          s.programmatic = true; // the popup may pan the map; that is not the user searching a new area
          cb.current.onSelect(cafe.id);
        });
        marker.addTo(s.layer);
        s.singles.set(cafe.id, marker);
      } else {
        const lat = members.reduce((a, m) => a + m.pos.lat, 0) / members.length;
        const lng = members.reduce((a, m) => a + m.pos.lng, 0) / members.length;
        const group: Group = { key, members, lat, lng };
        const active = members.some((m) => activeIds.has(m.cafe.id));
        const size = members.length < 10 ? 32 : members.length < 30 ? 38 : 44;
        const marker = lib
          .marker([lat, lng], {
            icon: lib.divIcon({ className: "", html: clusterHtml(members.length, active), iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }),
            title: `${members.length} places: ${members.slice(0, 3).map((m) => m.cafe.name).join(", ")}${members.length > 3 ? "…" : ""}`,
            alt: `${members.length} places`,
            keyboard: true,
          })
          .bindPopup(() => listPopup(group.members, selectionRef.current.id), { maxWidth: 280 });
        marker.on("click", () => {
          s.programmatic = true;
          const sameSpot = members.every((m) => m.pos.lat === members[0].pos.lat && m.pos.lng === members[0].pos.lng);
          if (z >= STREET_ZOOM || sameSpot) {
            marker.openPopup();
          } else {
            map.fitBounds(lib.latLngBounds(members.map((m) => [m.pos.lat, m.pos.lng] as [number, number])), { padding: [70, 70], maxZoom: STREET_ZOOM });
          }
        });
        marker.addTo(s.layer);
        s.clusters.set(key, { marker, group });
      }
    }

    // Redrawing closes any open popup; reopen the one for the current selection (no panning).
    const sel = selectionRef.current.id;
    if (sel) openFor(s, sel, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, items, zoom]);

  // ---- highlight the hovered / selected cafe ------------------------------------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const active = new Set([hoveredId, selection.id].filter(Boolean) as string[]);
    for (const [id, marker] of s.singles) {
      const it = itemsRef.current.find((i) => i.cafe.id === id);
      if (!it) continue;
      marker.setIcon(
        s.lib.divIcon({ className: "", html: `<span style="display:flex;width:${HIT}px;height:${HIT}px;align-items:center;justify-content:center">${dotHtml(it.pos.approximate, active.has(id))}</span>`, iconSize: [HIT, HIT], iconAnchor: [HIT / 2, HIT / 2], popupAnchor: [0, -HIT / 2] }),
      );
      marker.setZIndexOffset(active.has(id) ? 1000 : 0);
    }
    for (const { marker, group } of s.clusters.values()) {
      const size = group.members.length < 10 ? 32 : group.members.length < 30 ? 38 : 44;
      marker.setIcon(s.lib.divIcon({ className: "", html: clusterHtml(group.members.length, group.members.some((m) => active.has(m.cafe.id))), iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }));
    }
  }, [loaded, hoveredId, selection.id, items, zoom]);

  // ---- selection: pan to it (from the list / a link) and open its preview --------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const id = selection.id;
    if (!id) {
      s.map.closePopup();
      return;
    }
    const it = itemsRef.current.find((i) => i.cafe.id === id) ?? (byId.get(id) ? { cafe: byId.get(id)!, pos: positionOf(byId.get(id)!)! } : null);
    if (!it?.pos) return;
    if (selection.source !== "map") {
      s.programmatic = true;
      // Zoom in far enough that the cafe is no longer merged into a cluster (unless it shares a building).
      s.map.setView([it.pos.lat, it.pos.lng], Math.max(s.map.getZoom(), STREET_ZOOM - 1), { animate: true });
    }
    // The zoom (if any) re-draws the markers, which re-opens the selection's popup; open now for the no-zoom case.
    openFor(s, id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selection.seq]);

  // ---- fit / restore the view ----------------------------------------------------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s || !command) return;
    s.programmatic = true;
    if (command.kind === "view") {
      s.map.setView([command.view.lat, command.view.lng], command.view.zoom);
      return;
    }
    const pts = itemsRef.current.map((i) => [i.pos.lat, i.pos.lng] as [number, number]);
    if (!pts.length) s.map.setView([TORONTO.lat, TORONTO.lng], 12);
    else if (pts.length === 1) s.map.setView(pts[0], 15);
    else s.map.fitBounds(s.lib.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, command?.seq]);

  // ---- "Near me" -----------------------------------------------------------------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s || !userLoc) return;
    if (!s.user) {
      s.user = s.lib
        .circleMarker([userLoc.lat, userLoc.lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1 })
        .bindTooltip("You are here")
        .addTo(s.map);
    } else {
      s.user.setLatLng([userLoc.lat, userLoc.lng]);
    }
    s.programmatic = true;
    s.map.setView([userLoc.lat, userLoc.lng], 14);
  }, [loaded, userLoc]);

  return <div ref={el} className="absolute inset-0 isolate z-0 bg-wash" role="region" aria-label="Map of Toronto cafes" />;
}

/** Open the preview for one cafe: its own marker, or the cluster popup that contains it. Optionally pan to it. */
function openFor(s: Store, id: string, pan: boolean) {
  const single = s.singles.get(id);
  if (single) {
    if (pan) s.map.panTo(single.getLatLng());
    single.openPopup();
    return;
  }
  for (const { marker, group } of s.clusters.values()) {
    if (group.members.some((m) => m.cafe.id === id)) {
      if (pan) s.map.panTo(marker.getLatLng());
      marker.openPopup();
      return;
    }
  }
}
