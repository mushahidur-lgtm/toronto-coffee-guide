"use client";

import { useEffect, useState } from "react";
import type { CafeView } from "@/lib/types";
import type { Bbox, MapViewState } from "@/lib/map-state";
import { getNeighbourhood } from "@/lib/neighbourhoods";
import { hoursSummary } from "@/lib/hours";
import { googleMapsDirectionsUrl } from "@/lib/maps";
import type { LatLng } from "@/lib/geo";
import { venueBadge } from "@/lib/venue";
import { VENUE_BADGE_STYLE } from "../VenueBadge";

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

/** Shown on the map and in /about wherever the coordinates are used. */
export const LOCATION_ATTRIBUTION = "Contains information licensed under the Open Government Licence – Toronto.";

export interface MapPoint extends LatLng {
  /** true = the neighbourhood centre (we have no confirmed address for this cafe), drawn as a hollow marker. */
  approximate: boolean;
}

/**
 * Where a cafe sits on the map: its own coordinates (from the City of Toronto address data) when we have them,
 * otherwise the centre of its neighbourhood, flagged `approximate` so it is never drawn as an exact pin.
 */
export function positionOf(c: CafeView): MapPoint | null {
  if (c.latitude != null && c.longitude != null) return { lat: c.latitude, lng: c.longitude, approximate: false };
  const n = getNeighbourhood(c.neighbourhood);
  return n ? { lat: n.lat, lng: n.lng, approximate: true } : null;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export const cafeHref = (slug: string) => `/cafes/${encodeURIComponent(slug)}`;

/** Same-origin optimised thumbnail (the image optimiser allows 384px). */
const thumb = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=384&q=75`;

/** Preview card for a map popup: photo, name, neighbourhood, type, status, links. Every value is escaped. */
export function popupHtml(c: CafeView, now: Date, approximate = false): string {
  const hs = hoursSummary(c, now);
  const statusHtml = `<div style="margin-top:7px;color:${hs.open ? "#2f5a24;font-weight:500" : "#3d3d3d"}">${esc(hs.text)}</div>`;
  const types = c.cafe_categories.slice(0, 2).join(" · ");
  const vb = VENUE_BADGE_STYLE[c.venue_type];
  const photo = c.image
    ? `<a href="${esc(cafeHref(c.slug))}" style="display:block;position:relative;margin:-2px -2px 8px"><img src="${esc(thumb(c.image.src))}" alt="${esc(c.image.alt ?? `${c.name}`)}" loading="lazy" width="250" height="141" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:${esc(c.image.color)}">${
        c.image.label ? `<span style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;padding:1px 8px;border-radius:999px">${esc(c.image.label)}</span>` : ""
      }</a>`
    : "";
  return `<div style="font:13px/1.45 var(--font-inter),system-ui,sans-serif;color:${INK};min-width:200px;max-width:250px;padding:2px 2px 4px">
    ${photo}
    <a href="${esc(cafeHref(c.slug))}" style="display:block;font-size:15px;font-weight:600;color:${INK};text-decoration:none;line-height:1.25">${esc(c.name)}</a>
    <div style="margin-top:3px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b">${esc(c.neighbourhood)}</div>
    <div style="margin-top:5px"><span style="display:inline-block;border:1px solid ${vb.border};background:${vb.bg};color:${vb.fg};padding:0 6px;font-size:11px;font-weight:500;line-height:16px">${esc(venueBadge(c.venue_type, c))}</span></div>
    ${types ? `<div style="margin-top:3px;color:#3d3d3d">${esc(types)}</div>` : ""}
    ${c.google_rating ? `<div style="margin-top:3px;color:#3d3d3d">★ ${c.google_rating.toFixed(1)}${c.google_review_count ? ` (${c.google_review_count.toLocaleString("en-CA")})` : ""} <span style="color:#6b6b6b;font-size:11px">Google</span></div>` : ""}
    ${statusHtml}
    ${approximate ? `<div style="margin-top:6px;font-size:11px;color:#6b6b6b">Shown at the neighbourhood centre: exact address not confirmed.</div>` : ""}
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
