"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { CafeView } from "@/lib/types";
import { COFFEE, ESPRESSO, INK, TORONTO, popupHtml, positionOf, type CanvasProps, type ViewportReport } from "./shared";
import { loadGoogleMaps } from "./loader";

/**
 * Google Maps canvas: AdvancedMarkerElement pins (Map ID required), MarkerClusterer, one shared InfoWindow.
 * The map, markers and clusterer are created once; filters only add/remove markers from the clusterer,
 * hover/selection only restyle pins. All listeners are removed on unmount.
 */


type PinStyle = "normal" | "featured" | "active";

function stylePin(pin: google.maps.marker.PinElement, style: PinStyle) {
  if (style === "active") {
    pin.background = INK;
    pin.borderColor = "#000";
    pin.glyphColor = "#fff";
    pin.scale = 1.45;
  } else if (style === "featured") {
    pin.background = ESPRESSO;
    pin.borderColor = "#1c110a";
    pin.glyphColor = "#e9c46a";
    pin.scale = 1.2;
  } else {
    pin.background = COFFEE;
    pin.borderColor = ESPRESSO;
    pin.glyphColor = "#f6efe8";
    pin.scale = 1;
  }
}

interface Store {
  map: google.maps.Map;
  info: google.maps.InfoWindow;
  clusterer: MarkerClusterer;
  markers: Map<string, { marker: google.maps.marker.AdvancedMarkerElement; pin: google.maps.marker.PinElement; cafe: CafeView }>;
  Advanced: typeof google.maps.marker.AdvancedMarkerElement;
  user?: google.maps.marker.AdvancedMarkerElement;
  /** Stand-in highlighted pin for a hovered cafe whose own pin is hidden inside a cluster. */
  ghost?: { marker: google.maps.marker.AdvancedMarkerElement; pin: google.maps.marker.PinElement };
  listeners: google.maps.MapsEventListener[];
  /** Set before our own camera moves so the next "idle" is reported as not user-initiated. */
  programmatic: boolean;
}

export default function GoogleMapCanvas({ cafes, visibleIds, selection, hoveredId, command, userLoc, now, onSelect, onViewport }: CanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const store = useRef<Store | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef({ onSelect, onViewport, now });
  cb.current = { onSelect, onViewport, now };
  const placed = useMemo(() => cafes.filter((c) => positionOf(c, "google")), [cafes]);

  // ---- create once -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!;
        const importLibrary = await loadGoogleMaps();
        const [{ Map: GMap, InfoWindow }, { AdvancedMarkerElement, PinElement }, mc] = await Promise.all([
          importLibrary("maps"),
          importLibrary("marker"),
          import("@googlemaps/markerclusterer"),
        ]);
        if (cancelled || !el.current) return;

        const map = new GMap(el.current, {
          center: TORONTO,
          zoom: 12,
          mapId,
          gestureHandling: "greedy", // the map fills the view; lists scroll separately
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const info = new InfoWindow({ maxWidth: 280 });

        const markers: Store["markers"] = new Map();
        for (const c of placed) {
          const pin = new PinElement();
          stylePin(pin, c.featured ? "featured" : "normal");
          const marker = new AdvancedMarkerElement({
            position: positionOf(c, "google")!,
            content: pin,
            title: c.name,
            gmpClickable: true,
            zIndex: c.featured ? 2 : 1,
          });
          marker.addEventListener("gmp-click", () => cb.current.onSelect(c.id));
          markers.set(c.id, { marker, pin, cafe: c });
        }

        const clusterer = new mc.MarkerClusterer({
          map,
          markers: [],
          algorithm: new mc.SuperClusterAlgorithm({ maxZoom: 15, radius: 70 }),
          renderer: {
            render: ({ count, position }) => {
              const size = count < 10 ? 34 : count < 25 ? 40 : 48;
              const div = document.createElement("div");
              div.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${COFFEE};color:#fff;border:3px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui,sans-serif`;
              div.textContent = String(count);
              return new AdvancedMarkerElement({ position, content: div, title: `${count} cafes. Click to zoom in`, zIndex: 1000 + count });
            },
          },
        });

        const ghostPin = new PinElement();
        stylePin(ghostPin, "active");
        const ghost = { pin: ghostPin, marker: new AdvancedMarkerElement({ content: ghostPin, zIndex: 15_000 }) };
        const s: Store = { map, info, clusterer, markers, Advanced: AdvancedMarkerElement, ghost, listeners: [], programmatic: true };
        s.listeners.push(
          info.addListener("closeclick", () => cb.current.onSelect(null)),
          map.addListener("dragstart", () => (s.programmatic = false)),
          map.addListener("idle", () => {
            const b = map.getBounds();
            const c = map.getCenter();
            if (!b || !c) return;
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            const report: ViewportReport = {
              bbox: { s: sw.lat(), w: sw.lng(), n: ne.lat(), e: ne.lng() },
              view: { lat: c.lat(), lng: c.lng(), zoom: map.getZoom() ?? 12 },
              user: !s.programmatic,
            };
            s.programmatic = false;
            cb.current.onViewport(report);
          }),
        );
        store.current = s;
        setLoaded(true);
      } catch (err) {
        console.error("[map] Google Maps failed to load", err);
        if (!cancelled) setError("The map couldn't load. Check the Google Maps browser key and Map ID.");
      }
    })();
    return () => {
      cancelled = true;
      const s = store.current;
      if (!s) return;
      s.listeners.forEach((l) => l.remove());
      google.maps.event.clearInstanceListeners(s.map);
      s.clusterer.clearMarkers(true);
      s.clusterer.setMap(null);
      s.info.close();
      s.markers.forEach(({ marker }) => (marker.map = null));
      if (s.user) s.user.map = null;
      if (s.ghost) s.ghost.marker.map = null;
      store.current = null;
    };
    // Created once; the cafe list doesn't change after the page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- filters: show/hide markers ------------------------------------------------------
  // A selected cafe stays on the map even if filtered out. Selecting a visible cafe must not touch the
  // clusterer (re-adding markers would detach the open InfoWindow).
  const pinned = selection.id && !visibleIds.has(selection.id) ? selection.id : null;
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const shown: google.maps.marker.AdvancedMarkerElement[] = [];
    s.markers.forEach(({ marker }, id) => {
      if (visibleIds.has(id) || id === pinned) shown.push(marker);
    });
    s.clusterer.clearMarkers(true);
    s.clusterer.addMarkers(shown);
  }, [loaded, visibleIds, pinned]);

  // ---- hover + selection: restyle pins ----------------------------------------------------
  const styled = useRef<Set<string>>(new Set());
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    const active = new Set([hoveredId, selection.id].filter(Boolean) as string[]);
    for (const id of styled.current) {
      if (active.has(id)) continue;
      const m = s.markers.get(id);
      if (m) {
        stylePin(m.pin, m.cafe.featured ? "featured" : "normal");
        m.marker.zIndex = m.cafe.featured ? 2 : 1;
      }
    }
    for (const id of active) {
      const m = s.markers.get(id);
      if (m) {
        stylePin(m.pin, "active");
        m.marker.zIndex = 10_000;
      }
    }
    styled.current = active;

    // Hovered pin hidden in a cluster: show a highlighted stand-in at its position.
    const h = hoveredId ? s.markers.get(hoveredId) : null;
    // Only detach it when it's attached: setting map = null on a never-added marker throws inside the Maps API.
    if (s.ghost) {
      try {
        if (h && !h.marker.map && h.marker.position) {
          s.ghost.marker.position = h.marker.position;
          s.ghost.marker.title = h.cafe.name;
          if (!s.ghost.marker.map) s.ghost.marker.map = s.map;
        } else if (s.ghost.marker.map) {
          s.ghost.marker.map = null;
        }
      } catch (err) {
        console.warn("[map] hover highlight failed", err);
      }
    }
  }, [loaded, hoveredId, selection.id]);

  // ---- selection: popup (+ pan when it came from the list, a link or history) ------------------
  const autoPanTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(autoPanTimer.current), []);
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s) return;
    if (!selection.id) {
      s.info.close();
      return;
    }
    const m = s.markers.get(selection.id);
    if (!m) {
      s.info.close();
      return;
    }
    if (selection.source !== "map") {
      s.programmatic = true;
      const zoom = s.map.getZoom() ?? 12;
      if (zoom < 16) s.map.setZoom(16); // past the cluster threshold, so the pin is on its own
      s.map.panTo(m.marker.position as google.maps.LatLngLiteral);
    }
    s.info.setContent(popupHtml(m.cafe, cb.current.now));
    // Opening an InfoWindow can auto-pan the map to fit it; that move is ours, not the user's.
    s.programmatic = true;
    clearTimeout(autoPanTimer.current);
    autoPanTimer.current = setTimeout(() => {
      if (store.current) store.current.programmatic = false; // no pan happened; don't swallow the next user move
    }, 900);
    s.info.open({ map: s.map, anchor: m.marker, shouldFocus: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selection.seq]);

  // ---- commands: fit to visible pins / restore a viewport ------------------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s || !command) return;
    s.programmatic = true;
    if (command.kind === "view") {
      s.map.setCenter({ lat: command.view.lat, lng: command.view.lng });
      s.map.setZoom(command.view.zoom);
      return;
    }
    const pts: google.maps.LatLngLiteral[] = [];
    s.markers.forEach(({ cafe }, id) => {
      if (visibleIds.has(id)) pts.push(positionOf(cafe, "google")!);
    });
    if (!pts.length) {
      s.map.setCenter(TORONTO);
      s.map.setZoom(12);
    } else if (pts.length === 1) {
      s.map.setCenter(pts[0]);
      s.map.setZoom(15);
    } else {
      const b = new google.maps.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      s.map.fitBounds(b, 56);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, command?.seq]);

  // ---- "Near me": blue dot ---------------------------------------------------------------------
  useEffect(() => {
    const s = store.current;
    if (!loaded || !s || !userLoc) return;
    if (!s.user) {
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.2),0 1px 3px rgba(0,0,0,.35)";
      s.user = new s.Advanced({ map: s.map, position: userLoc, content: dot, title: "You are here", zIndex: 20_000 });
    } else {
      s.user.position = userLoc;
    }
    s.programmatic = true;
    s.map.panTo(userLoc);
    s.map.setZoom(15);
  }, [loaded, userLoc]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full bg-wash" role="region" aria-label="Map of Toronto cafes" />
      {!loaded && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading map…</p>}
      {error && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">{error}</p>}
    </div>
  );
}
