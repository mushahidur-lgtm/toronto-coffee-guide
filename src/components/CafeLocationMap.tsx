"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { loadGoogleMaps } from "./map/loader";

interface Props {
  name: string;
  /** Google's live location (only passed when the Google map renders, per Google's terms). */
  googleLocation: { lat: number; lng: number } | null;
  /** Our own coordinates, if any. */
  editorialLocation: { lat: number; lng: number } | null;
  /** Neighbourhood centre, used for an approximate-area map when there are no exact coordinates. */
  area: { name: string; lat: number; lng: number } | null;
  useGoogle: boolean;
  /** Caption under an approximate-area map (defaults to a cafe-page hint about directions). */
  areaNote?: string;
}

/**
 * Small location map for a cafe page. Google map with the exact pin when a browser key + Map ID are set;
 * otherwise OpenStreetMap with our own coordinates, or the neighbourhood shaded as an approximate area.
 */
export function CafeLocationMap({ name, googleLocation, editorialLocation, area, useGoogle, areaNote }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const exact = (useGoogle ? googleLocation : null) ?? editorialLocation;
      if (useGoogle && exact) {
        const importLibrary = await loadGoogleMaps();
        const [{ Map: GMap }, { AdvancedMarkerElement, PinElement }] = await Promise.all([importLibrary("maps"), importLibrary("marker")]);
        if (cancelled || !el.current) return;
        const map = new GMap(el.current, {
          center: exact,
          zoom: 16,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID!,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const pin = new PinElement({ background: "#7a4b2a", borderColor: "#3b2416", glyphColor: "#f6efe8", scale: 1.2 });
        const marker = new AdvancedMarkerElement({ map, position: exact, content: pin, title: name });
        cleanup = () => {
          marker.map = null;
          google.maps.event.clearInstanceListeners(map);
        };
        return;
      }
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const center = exact ?? (area ? { lat: area.lat, lng: area.lng } : null);
      if (!center) return;
      const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([center.lat, center.lng], exact ? 16 : 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      if (exact) {
        L.circleMarker([exact.lat, exact.lng], { radius: 9, color: "#3b2416", weight: 2, fillColor: "#7a4b2a", fillOpacity: 0.9 }).addTo(map).bindTooltip(name);
      } else if (area) {
        L.circle([area.lat, area.lng], { radius: 650, color: "#3b2416", weight: 1, fillColor: "#7a4b2a", fillOpacity: 0.15 }).addTo(map);
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
  }, [name, googleLocation, editorialLocation, area, useGoogle, areaNote]);

  return (
    <div>
      <div ref={el} className="isolate z-0 aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-wash" role="region" aria-label={`Map showing ${name}`} />
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}
