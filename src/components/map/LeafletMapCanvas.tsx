"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { CafeView } from "@/lib/types";
import { getNeighbourhood } from "@/lib/neighbourhoods";
import { COFFEE, INK, TORONTO, cafeHref, esc, type CanvasProps } from "./shared";

/**
 * Leaflet / OpenStreetMap fallback (no Google key or Map ID). Google coordinates can't be shown on a non-Google
 * map, so cafes are drawn as one circle per neighbourhood. Selecting a cafe highlights and opens its
 * neighbourhood; clicking a circle selects the first visible cafe there. All listeners are removed on unmount.
 */

type L = typeof import("leaflet");

interface Store {
  lib: L;
  map: import("leaflet").Map;
  layer: import("leaflet").LayerGroup;
  circles: Map<string, import("leaflet").CircleMarker>;
  user?: import("leaflet").CircleMarker;
  programmatic: boolean;
}

const baseStyle = (n: number) => ({ radius: 7 + Math.sqrt(n) * 4, color: INK, weight: 1, fillColor: COFFEE, fillOpacity: 0.55 });
const activeStyle = { color: INK, weight: 3, fillColor: INK, fillOpacity: 0.75 };

function popup(hood: string, list: CafeView[], selectedId: string | null) {
  return `<div style="font:13px/1.45 var(--font-inter),system-ui;min-width:180px;max-height:220px;overflow:auto">
    <strong style="font-size:14px">${esc(hood)}</strong>
    <ul style="margin:6px 0 0;padding:0;list-style:none">${list
      .map(
        (c) =>
          `<li style="margin:2px 0"><button type="button" data-cafe="${esc(c.id)}" style="all:unset;cursor:pointer;color:${INK};${
            c.id === selectedId ? "font-weight:700;text-decoration:underline" : ""
          }">${esc(c.name)}</button> <a href="${esc(cafeHref(c.slug))}" style="color:#6b6b6b;font-size:12px">↗</a></li>`,
      )
      .join("")}</ul>
  </div>`;
}

export default function LeafletMapCanvas({ cafes, visibleIds, selection, hoveredId, command, userLoc, onSelect, onViewport }: CanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const store = useRef<Store | null>(null);
  const [loaded, setLoaded] = useState(false);
  const cb = useRef({ onSelect, onViewport });
  cb.current = { onSelect, onViewport };
  const byId = useMemo(() => new Map(cafes.map((c) => [c.id, c])), [cafes]);

  // A selected cafe stays on the map even when filtered out; otherwise selecting must not redraw anything.
  const pinned = selection.id && !visibleIds.has(selection.id) ? selection.id : null;
  // Visible cafes grouped by neighbourhood.
  const groups = useMemo(() => {
    const g = new Map<string, CafeView[]>();
    for (const c of cafes) {
      if (!visibleIds.has(c.id) && c.id !== pinned) continue;
      if (!getNeighbourhood(c.neighbourhood)) continue;
      g.set(c.neighbourhood, [...(g.get(c.neighbourhood) ?? []), c]);
    }
    return g;
  }, [cafes, visibleIds, pinned]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const map = lib.map(el.current, { zoomControl: true }).setView([TORONTO.lat, TORONTO.lng], 12);
      lib.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const s: Store = { lib, map, layer: lib.layerGroup().addTo(map), circles: new Map(), programmatic: true };

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
      // Names inside a popup select that cafe in the list.
      map.on("popupopen", (e) => {
        const node = e.popup.getElement();
        if (!node) return;
        // Assigned (not added) so reopening a popup never stacks handlers.
        node.onclick = (ev) => {
          const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-cafe]")?.dataset.cafe;
          if (id) cb.current.onSelect(id);
        };
      });
      store.current = s;
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

  // Redraw circles when the visible set changes (the map itself stays).
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    s.layer.clearLayers();
    s.circles.clear();
    for (const [hood, list] of groups) {
      const n = getNeighbourhood(hood)!;
      const circle = s.lib
        .circleMarker([n.lat, n.lng], baseStyle(list.length))
        .bindTooltip(`${n.name} · ${list.length}`, { direction: "top" })
        .bindPopup(() => popup(hood, groupsRef.current.get(hood) ?? list, null));
      circle.on("click", () => {
        const first = (groupsRef.current.get(hood) ?? list).find((c) => visibleIds.has(c.id)) ?? list[0];
        if (first) cb.current.onSelect(first.id);
      });
      circle.addTo(s.layer);
      s.circles.set(hood, circle);
    }
    // Redrawing removes the open popup; reopen it for the current selection.
    const sel = selectionRef.current.id ? byId.get(selectionRef.current.id) : null;
    const selCircle = sel ? s.circles.get(sel.neighbourhood) : null;
    if (sel && selCircle) {
      selCircle.setPopupContent(popup(sel.neighbourhood, groups.get(sel.neighbourhood) ?? [sel], sel.id));
      selCircle.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, groups]);

  // Highlight the hovered / selected cafe's neighbourhood.
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const active = new Set([hoveredId, selection.id].map((id) => (id ? byId.get(id)?.neighbourhood : null)).filter(Boolean) as string[]);
    s.circles.forEach((circle, hood) => {
      const count = groups.get(hood)?.length ?? 1;
      circle.setStyle(active.has(hood) ? activeStyle : baseStyle(count));
      if (active.has(hood)) circle.bringToFront();
    });
  }, [loaded, hoveredId, selection.id, groups, byId]);

  // Selection: open the neighbourhood popup (pan when it came from the list / a link).
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const c = selection.id ? byId.get(selection.id) : null;
    if (!c) {
      s.map.closePopup();
      return;
    }
    const circle = s.circles.get(c.neighbourhood);
    const n = getNeighbourhood(c.neighbourhood);
    if (!circle || !n) return;
    if (selection.source !== "map") {
      s.programmatic = true;
      s.map.setView([n.lat, n.lng], Math.max(s.map.getZoom(), 14), { animate: true });
    }
    circle.setPopupContent(popup(c.neighbourhood, groups.get(c.neighbourhood) ?? [c], c.id));
    circle.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selection.seq]);

  useEffect(() => {
    const s = store.current;
    if (!loaded || !s || !command) return;
    s.programmatic = true;
    if (command.kind === "view") {
      s.map.setView([command.view.lat, command.view.lng], command.view.zoom);
      return;
    }
    const pts = [...groups.keys()].map((h) => getNeighbourhood(h)!).map((n) => [n.lat, n.lng] as [number, number]);
    if (!pts.length) s.map.setView([TORONTO.lat, TORONTO.lng], 12);
    else if (pts.length === 1) s.map.setView(pts[0], 14);
    else s.map.fitBounds(s.lib.latLngBounds(pts), { padding: [48, 48] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, command?.seq]);

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

  return <div ref={el} className="absolute inset-0 isolate z-0 bg-wash" role="region" aria-label="Map of Toronto cafes by neighbourhood" />;
}
