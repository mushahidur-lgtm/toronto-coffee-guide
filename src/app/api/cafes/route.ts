import { NextResponse, type NextRequest } from "next/server";
import { getCafeViews } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, indexCafe, type SortKey } from "@/lib/search";

export const revalidate = 3600;

/**
 * GET /api/cafes?q=matcha&n=Chinatown,Downtown&type=Korean%20Cafe&sort=az&limit=24&offset=0
 * JSON search endpoint using the same engine as the UI.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = Math.min(Number(p.get("limit")) || 24, 200);
  const offset = Math.max(Number(p.get("offset")) || 0, 0);

  const cafes = await getCafeViews();
  const hits = applyFilters(cafes.map(indexCafe), {
    ...EMPTY_FILTERS,
    query: p.get("q") ?? "",
    neighbourhoods: list("n"),
    types: list("type"),
    sort: (p.get("sort") as SortKey) || "relevance",
  });

  return NextResponse.json({
    total: hits.length,
    offset,
    limit,
    results: hits.slice(offset, offset + limit).map((h) => ({ ...h.cafe, score: h.score, highlights: h.highlights })),
  });
}
