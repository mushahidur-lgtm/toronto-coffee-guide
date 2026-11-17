"use client";

import { useEffect, useState } from "react";
import type { CafeView } from "@/lib/types";
import type { Bbox, MapViewState } from "@/lib/map-state";
import { getNeighbourhood } from "@/lib/neighbourhoods";
import { todayStatus, todayStatusText } from "@/lib/hours";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import type { LatLng } from "@/lib/geo";
import { venueInfo } from "@/lib/venue";
import { VENUE_BADGE_STYLE } from "../VenueBadge";

export type MapMode = "google" | "leaflet";
export type SelectSource = "map" | "list" | "url" | "history";

export interface Selection {
  id: string | null;
  source: SelectSource;
  seq: number;
}

/** One-shot instructions for the map, re-run whenever `seq` changes. */
export type MapCommand = { kind: "fit"; seq: number } | { kind: "view"; seq: number; view: MapViewState };

export interface ViewportReport {
  bbox: Bbox;
  view: MapViewState;
  /** false when the move was ours (fit, pan to a selection, back/forward). */
  user: boolean;
}

export interface CanvasProps {
  cafes: CafeView[];
  visibleIds: Set<string>;
  selection: Selection;
  hoveredId: string | null;
  command: MapCommand | null;
  userLoc: LatLng | null;
  now: Date;
  onSelect: (id: string | null) => void;
  onViewport: (v: ViewportReport) => void;
}

export const TORONTO: LatLng = { lat: 43.6839, lng: -79.39 };
export const COFFEE = "#7a4b2a";
export const ESPRESSO = "#3b2416";
export const INK = "#161616";

/**
 * Where a cafe sits on the map. Google mode: Google's live location (only ever sent to the browser in Google
 * mode). Leaflet mode: our own coordinates, else the neighbourhood centre (approximate).
 */
export function positionOf(c: CafeView, mode: MapMode): LatLng | null {
  if (c.latitude != null && c.longitude != null) return { lat: c.latitude, lng: c.longitude };
  if (mode === "google") return c.google_location;
  const n = getNeighbourhood(c.neighbourhood);
  return n ? { lat: n.lat, lng: n.lng } : null;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export const cafeHref = (slug: string) => `/cafes/${encodeURIComponent(slug)}`;

/** Concise preview card for a map popup. Every value is escaped; no Google photos. */
export function popupHtml(c: CafeView, now: Date): string {
  const status = todayStatus(c.opening_hours, now);
  const statusHtml = status
    ? `<div style="margin-top:7px;color:${status.state === "open" ? "#2f5a24;font-weight:500" : "#3d3d3d"}">${esc(todayStatusText(status))}</div>`
    : "";
  const types = c.cafe_categories.slice(0, 2).join(" · ");
  const vb = VENUE_BADGE_STYLE[c.venue_type];
  return `<div style="font:13px/1.45 var(--font-inter),system-ui,sans-serif;color:${INK};min-width:190px;max-width:250px;padding:2px 2px 4px">
    <a href="${esc(cafeHref(c.slug))}" style="display:block;font-size:15px;font-weight:600;color:${INK};text-decoration:none;line-height:1.25">${esc(c.name)}</a>
    <div style="margin-top:3px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b">${esc(c.neighbourhood)}</div>
    <div style="margin-top:5px"><span style="display:inline-block;border:1px solid ${vb.border};background:${vb.bg};color:${vb.fg};padding:0 6px;font-size:11px;font-weight:500;line-height:16px">${esc(venueInfo(c.venue_type).badge)}</span></div>
    ${types ? `<div style="margin-top:3px;color:#3d3d3d">${esc(types)}</div>` : ""}
    ${statusHtml}
    <div style="margin-top:9px;display:flex;gap:14px">
      <a href="${esc(cafeHref(c.slug))}" style="color:${INK}">View cafe</a>
      <a href="${esc(googleMapsDirectionsUrl(c.name, c.address, c.google_place_id))}" target="_blank" rel="noopener noreferrer" style="color:${INK}">Directions ↗</a>
    </div>
  </div>`;
}

/** SSR-safe media query (assumes desktop until mounted). */
export function useMediaQuery(query: string, ssrDefault = true): boolean {
  const [matches, setMatches] = useState(ssrDefault);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
