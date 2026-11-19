"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { LOCATION_ATTRIBUTION } from "./map/shared";

interface Props {
  name: string;
  /** The cafe's own coordinates (City of Toronto address data). */
  location: { lat: number; lng: number } | null;
  /** Neighbourhood centre, used for an approximate-area map when there are no exact coordinates. */
  area: { name: string; lat: number; lng: number } | null;
  /** Caption under an approximate-area map. */
  areaNote?: string;
}

/**
 * Small location map for a cafe page, on OpenStreetMap (no API key, no per-view cost): an exact pin when we have the
 * cafe's coordinates, otherwise the neighbourhood shaded as an approximate area.
 */
export function CafeLocationMap({ name, location, area, areaNote }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const center = location ?? (area ? { lat: area.lat, lng: area.lng } : null);
      if (!center) return;
      const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([center.lat, center.lng], location ? 17 : 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors${location ? " · " + LOCATION_ATTRIBUTION.replace("Open Government Licence – Toronto", '<a href="https://open.toronto.ca/open-data-licence/" target="_blank" rel="noopener noreferrer">Open Government Licence – Toronto</a>') : ""}`,
      }).addTo(map);
      if (location) {
        L.circleMarker([location.lat, location.lng], { radius: 9, color: "#ffffff", weight: 2, fillColor: "#7a4b2a", fillOpacity: 1 }).addTo(map).bindTooltip(name);
      } else if (area) {
        L.circle([area.lat, area.lng], { radius: 650, color: "#3b2416", weight: 1, dashArray: "4 4", fillColor: "#7a4b2a", fillOpacity: 0.12 }).addTo(map);
        setNote(areaNote ?? `Shows the ${area.name} area. Use directions for the exact location.`);
      }
      cleanup = () => {
        map.off();
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [name, location, area, areaNote]);

  return (
    <div>
      <div ref={el} className="isolate z-0 aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-wash" role="region" aria-label={`Map showing ${name}`} />
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}
