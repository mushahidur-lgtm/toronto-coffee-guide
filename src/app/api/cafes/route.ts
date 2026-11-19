import { NextResponse, type NextRequest } from "next/server";
import { getCafeViews } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, indexCafe, isSortKey } from "@/lib/search";
import { isVenueType, type VenueType } from "@/lib/venue";

export const revalidate = 3600;

const MAX_QUERY = 200;
const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 60;
const MAX_LIMIT = 200;

/**
 * GET /api/cafes?q=matcha&n=Chinatown,Downtown&type=Korean%20Cafe&sort=az&limit=24&offset=0
 * JSON search endpoint using the same engine as the UI.
 *
 * Input is bounded: q ≤ 200 characters, n/type ≤ 20 items (each ≤ 60 characters), limit 1–200,
 * and sort must be one of relevance | az | za | neighbourhood (anything else → relevance).
 * open=1 keeps only cafes whose listed hours say they are open now (Toronto time).
 * venue=specialty-cafe | tea-matcha | restaurant-coffee filters by venue type (anything else is ignored).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (k: string) =>
    (p.get(k) ?? "")
      .split(",")
      .map((s) => s.trim().slice(0, MAX_ITEM_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_LIST_ITEMS);
  const int = (k: string, fallback: number) => {
    const raw = p.get(k);
    if (raw === null || raw.trim() === "") return fallback; // missing ≠ 0
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? n : fallback;
  };
  const limit = Math.min(Math.max(int("limit", 24), 1), MAX_LIMIT);
  const offset = Math.max(int("offset", 0), 0);
  const sort = p.get("sort");

  // Never fail a search because Google is unavailable: degrade to editorial data instead of a 500.
  const cafes = await getCafeViews(false);
  const hits = applyFilters(cafes.map(indexCafe), {
    ...EMPTY_FILTERS,
    query: (p.get("q") ?? "").slice(0, MAX_QUERY),
    neighbourhoods: list("n"),
    types: list("type"),
    sort: isSortKey(sort) ? sort : "relevance",
    openNow: p.get("open") === "1",
    venue: isVenueType(p.get("venue")) ? (p.get("venue") as VenueType) : null,
  });

  return NextResponse.json({
    total: hits.length,
    offset,
    limit,
    results: hits.slice(offset, offset + limit).map((h) => ({ ...h.cafe, score: h.score, highlights: h.highlights })),
  });
}
