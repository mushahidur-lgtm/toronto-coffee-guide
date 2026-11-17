import { Star } from "lucide-react";

/** Google rating, shown only when Places returned one (live, never stored), with attribution. */
export function GoogleRating({ rating, count, className = "" }: { rating: number | null; count: number | null; className?: string }) {
  if (rating == null) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${className}`} title="Rating from Google">
      <Star size={13} strokeWidth={1.5} className="fill-[#e0a526] text-[#e0a526]" aria-hidden />
      <span className="font-medium tabular-nums text-ink">{rating.toFixed(1)}</span>
      {count != null && <span className="tabular-nums text-muted">({count.toLocaleString("en-CA")})</span>}
      <span className="text-[11px] text-muted">· Google</span>
      <span className="sr-only">
        Rated {rating.toFixed(1)} out of 5 on Google{count != null ? ` from ${count} reviews` : ""}
      </span>
    </span>
  );
}
