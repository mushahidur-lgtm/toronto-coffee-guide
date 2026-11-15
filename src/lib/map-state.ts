import { EMPTY_FILTERS, filtersFromParams, filtersToParams, type Filters } from "./search";
import { isExplorerCategory, type ExplorerCategory } from "./explorer";

/** Bounding box in degrees: south, west, north, east. */
export interface Bbox {
  s: number;
  w: number;
  n: number;
  e: number;
}

export interface MapViewState {
  lat: number;
  lng: number;
  zoom: number;
}

/**
 * Everything on /map that belongs in a shareable URL:
 *   ?q=&n=&type=&open=1            search filters shared with /cafes
 *   &category=third-wave,bakery    explorer category pills (any of)
 *   &laptop=1&patio=1              attribute toggles
 *   &bbox=s,w,n,e                  "Search this area"
 *   &selected=<slug>               selected cafe (legacy ?cafe= still read)
 *   &lat=&lng=&zoom=               map viewport
 */
export interface MapState {
  filters: Filters;
  categories: ExplorerCategory[];
  laptop: boolean;
  patio: boolean;
  bbox: Bbox | null;
  selected: string | null;
  view: MapViewState | null;
}

export const EMPTY_MAP_STATE: MapState = {
  filters: EMPTY_FILTERS,
  categories: [],
  laptop: false,
  patio: false,
  bbox: null,
  selected: null,
  view: null,
};

const num = (v: string | null, min: number, max: number): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export function parseMapState(p: URLSearchParams): MapState {
  const categories = (p.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isExplorerCategory)
    .filter((v, i, a) => a.indexOf(v) === i);

  let bbox: Bbox | null = null;
  const b = (p.get("bbox") ?? "").split(",").map(Number);
  if (b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && Math.abs(b[0]) <= 90 && Math.abs(b[2]) <= 90) {
    bbox = { s: b[0], w: b[1], n: b[2], e: b[3] };
  }

  const lat = num(p.get("lat"), -90, 90);
  const lng = num(p.get("lng"), -180, 180);
  const zoom = num(p.get("zoom"), 3, 21);
  const slug = (p.get("selected") ?? p.get("cafe") ?? "").trim();

  return {
    filters: { ...filtersFromParams((k) => p.get(k)), sort: "relevance" },
    categories,
    laptop: p.get("laptop") === "1",
    patio: p.get("patio") === "1",
    bbox,
    selected: /^[a-z0-9-]{1,120}$/.test(slug) ? slug : null,
    view: lat !== null && lng !== null && zoom !== null ? { lat, lng, zoom } : null,
  };
}

const round = (n: number, d: number) => Number(n.toFixed(d));

export function mapStateToParams(s: MapState): URLSearchParams {
  const p = filtersToParams({ ...s.filters, sort: "relevance" });
  if (s.categories.length) p.set("category", s.categories.join(","));
  if (s.laptop) p.set("laptop", "1");
  if (s.patio) p.set("patio", "1");
  if (s.bbox) p.set("bbox", [s.bbox.s, s.bbox.w, s.bbox.n, s.bbox.e].map((v) => round(v, 5)).join(","));
  if (s.selected) p.set("selected", s.selected);
  if (s.view) {
    p.set("lat", String(round(s.view.lat, 5)));
    p.set("lng", String(round(s.view.lng, 5)));
    p.set("zoom", String(round(s.view.zoom, 2)));
  }
  return p;
}

export const inBbox = (b: Bbox, pt: { lat: number; lng: number }) => pt.lat >= b.s && pt.lat <= b.n && pt.lng >= b.w && pt.lng <= b.e;

/**
 * Has the map moved "significantly" from the last searched area? True when the centre has shifted by more
 * than 30% of the old span, or the zoom changed by about a level or more.
 */
export function movedSignificantly(from: Bbox, to: Bbox): boolean {
  const spanLat = from.n - from.s;
  const spanLng = from.e - from.w;
  const dLat = Math.abs((from.n + from.s) / 2 - (to.n + to.s) / 2);
  const dLng = Math.abs((from.e + from.w) / 2 - (to.e + to.w) / 2);
  const zoomRatio = (to.n - to.s) / spanLat;
  return dLat > spanLat * 0.3 || dLng > spanLng * 0.3 || zoomRatio < 0.55 || zoomRatio > 1.8;
}
