"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { NEIGHBOURHOODS } from "@/lib/neighbourhoods";

export interface MapCafe {
  slug: string;
  name: string;
  neighbourhood: string;
  /** Live Google coordinates — only rendered on a Google map (Google Maps Platform terms). */
  google_location: { lat: number; lng: number } | null;
  /** Editorial coordinates (not from Google) — safe on any map. */
  editorial_location: { lat: number; lng: number } | null;
}

const TORONTO = { lat: 43.6839, lng: -79.39 };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function groupByHood(cafes: MapCafe[]) {
  const m = new Map<string, MapCafe[]>();
  for (const c of cafes) m.set(c.neighbourhood, [...(m.get(c.neighbourhood) ?? []), c]);
  return m;
}

function hoodPopup(name: string, list: MapCafe[]) {
  const slug = NEIGHBOURHOODS.find((n) => n.name === name)?.slug;
  return `<div style="font:13px/1.45 var(--font-inter),system-ui;min-width:180px">
    <strong style="font-size:14px">${esc(name)}</strong>
    <ul style="margin:6px 0 8px;padding:0;list-style:none">${list
      .map((c) => `<li><a href="/cafes/${encodeURIComponent(c.slug)}" style="color:#161616">${esc(c.name)}</a></li>`)
      .join("")}</ul>
    ${slug ? `<a href="/neighbourhoods/${encodeURIComponent(slug)}" style="color:#6b6b6b">View neighbourhood →</a>` : ""}
  </div>`;
}

export function MapView({ cafes }: { cafes: MapCafe[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"google" | "osm" | null>(null);
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    if (!ref.current) return;
    let cleanup = () => {};
    let cancelled = false;

    const startLeaflet = async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      setMode("osm");
      const map = L.map(ref.current, { scrollWheelZoom: false }).setView([TORONTO.lat, TORONTO.lng], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const exact = cafes.filter((c) => c.editorial_location);
      for (const c of exact) {
        L.circleMarker([c.editorial_location!.lat, c.editorial_location!.lng], { radius: 6, color: "#161616", weight: 1, fillColor: "#161616", fillOpacity: 0.9 })
          .bindPopup(`<a href="/cafes/${encodeURIComponent(c.slug)}" style="color:#161616;font-weight:600">${esc(c.name)}</a>`)
          .addTo(map);
      }
      // Cafes without editorial coordinates are shown at neighbourhood level.
      for (const [hood, list] of groupByHood(cafes.filter((c) => !c.editorial_location))) {
        const n = NEIGHBOURHOODS.find((x) => x.name === hood);
        if (!n) continue;
        L.circleMarker([n.lat, n.lng], {
          radius: 7 + Math.sqrt(list.length) * 4,
          color: "#161616",
          weight: 1,
          fillColor: "#7a4b2a",
          fillOpacity: 0.55,
        })
          .bindTooltip(`${n.name} · ${list.length}`, { direction: "top" })
          .bindPopup(hoodPopup(n.name, list))
          .addTo(map);
      }
      cleanup = () => map.remove();
    };

    const startGoogle = () =>
      new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const init = () => {
          if (cancelled || !ref.current) return resolve();
          const g = w.google.maps;
          setMode("google");
          const map = new g.Map(ref.current, {
            center: TORONTO,
            zoom: 11,
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || undefined,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          });
          const info = new g.InfoWindow();
          for (const c of cafes) {
            const pos = c.google_location ?? c.editorial_location;
            if (!pos) continue;
            const marker = new g.Marker({ position: pos, map, title: c.name });
            marker.addListener("click", () => {
              info.setContent(`<a href="/cafes/${encodeURIComponent(c.slug)}" style="color:#161616;font-weight:600">${esc(c.name)}</a><br/><span style="color:#6b6b6b">${esc(c.neighbourhood)}</span>`);
              info.open({ map, anchor: marker });
            });
          }
          for (const [hood, list] of groupByHood(cafes.filter((c) => !c.google_location && !c.editorial_location))) {
            const n = NEIGHBOURHOODS.find((x) => x.name === hood);
            if (!n) continue;
            const circle = new g.Circle({
              map,
              center: { lat: n.lat, lng: n.lng },
              radius: 180 + list.length * 40,
              strokeColor: "#161616",
              strokeWeight: 1,
              fillColor: "#7a4b2a",
              fillOpacity: 0.45,
            });
            circle.addListener("click", () => {
              info.setContent(hoodPopup(n.name, list));
              info.setPosition({ lat: n.lat, lng: n.lng });
              info.open({ map });
            });
          }
          resolve();
        };
        if (w.google?.maps?.Map) return init();
        w.__tcgMapInit = init;
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleKey!)}&v=weekly&loading=async&callback=__tcgMapInit`;
        s.async = true;
        s.onerror = () => reject(new Error("Google Maps failed to load"));
        document.head.appendChild(s);
      });

    if (googleKey) startGoogle().catch(startLeaflet);
    else startLeaflet();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cafes, googleKey]);

  return (
    <div>
      <div ref={ref} className="isolate z-0 h-[70vh] min-h-[420px] w-full border border-line bg-wash" role="region" aria-label="Map of Toronto cafes" />
      <p className="mt-3 text-xs text-muted">
        {mode === "google"
          ? "Pins show cafe locations from Google Maps. Shaded circles group cafes not yet matched to a Google place."
          : mode === "osm"
            ? "Circles group cafes by neighbourhood (size = number of cafes). Click one to see its cafes. Add a Google Maps browser key for exact pins."
            : "Loading map…"}
      </p>
    </div>
  );
}
