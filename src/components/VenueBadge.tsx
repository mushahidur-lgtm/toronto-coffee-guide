import { venueBadge, venueInfo, type VenueType } from "@/lib/venue";

/** Subtle colour per venue type: neutral for cafes, a muted green for tea, a warm tint for restaurants & bakeries. */
export const VENUE_BADGE_STYLE: Record<VenueType, { bg: string; fg: string; border: string }> = {
  "specialty-cafe": { bg: "#ffffff", fg: "#3d3d3d", border: "#cfcfcf" },
  "tea-matcha": { bg: "#eef3ea", fg: "#3f5a32", border: "#d5e2cc" },
  "restaurant-coffee": { bg: "#f6efe8", fg: "#6b4226", border: "#e7d8c9" },
};

export function VenueBadge({
  venue,
  cafe,
  className = "",
}: {
  venue: VenueType;
  /** The listing's categories and tags, so bakeries read "Bakery & Cafe" rather than "Restaurant & Bakery". */
  cafe?: { cafe_categories: string[]; tags: string[] };
  className?: string;
}) {
  const s = VENUE_BADGE_STYLE[venue];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-1.5 py-px text-[11px] font-medium leading-4 ${className}`}
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
      title={venueInfo(venue).label}
    >
      {cafe ? venueBadge(venue, cafe) : venueInfo(venue).badge}
    </span>
  );
}
