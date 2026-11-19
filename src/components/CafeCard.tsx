import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { CafeImage } from "./CafeImage";
import { VenueBadge } from "./VenueBadge";
import { FavouriteButton } from "./FavouriteButton";
import { GoogleRating } from "./GoogleRating";
import { TodayHours } from "./TodayHours";
import { formatDistance } from "@/lib/geo";
import { googleMapsDirectionsUrl, instagramHandle, isInstagramUrl } from "@/lib/maps";

interface Props {
  cafe: CafeView;
  highlights?: string[];
  priority?: boolean;
  /** Distance from the visitor, when sorting by "Near me". */
  distanceKm?: number;
}

const MAIN_TYPES = new Set([
  "Specialty Coffee", "Matcha Cafe", "Vietnamese Cafe", "Japanese Cafe", "Korean Cafe", "Bakery & Cafe", "Brunch Cafe", "Dessert Cafe", "Tea House", "Restaurant",
]);

/** Editorial cafe card: 16:9 photo + save, name, neighbourhood · category, description, tags, rating, today's hours, links. */
export function CafeCard({ cafe, highlights = [], priority, distanceKm }: Props) {
  const href = `/cafes/${cafe.slug}`;
  const category = cafe.cafe_categories.find((c) => MAIN_TYPES.has(c)) ?? cafe.cafe_categories[0];
  const tags = Array.from(new Set([...cafe.specialty_drinks, ...cafe.food_offerings])).slice(0, 4);
  const insta = isInstagramUrl(cafe.website_url);

  return (
    <article className="group flex h-full min-w-0 flex-col">
      <div className="relative overflow-hidden rounded-lg">
        <div className="transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transform-none">
          <CafeImage name={cafe.name} image={cafe.image} category={cafe.image_category} priority={priority} href={href} className="aspect-video" />
        </div>
        <div className="absolute right-3 top-3">
          <FavouriteButton slug={cafe.slug} name={cafe.name} />
        </div>
        <div className="pointer-events-none absolute left-3 top-3">
          <VenueBadge venue={cafe.venue_type} cafe={cafe} className="rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.08)]" />
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <h3 className="text-lg font-semibold leading-snug tracking-tight">
          <Link href={href} className="hover:underline hover:underline-offset-4">
            {cafe.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted">
          {cafe.neighbourhood}
          {category ? ` · ${category}` : ""}
          {distanceKm != null && ` · ${formatDistance(distanceKm)} away`}
        </p>
        <GoogleRating rating={cafe.google_rating} count={cafe.google_review_count} className="mt-1.5" />
        {cafe.description && <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-ink-2">{cafe.description}</p>}

        {highlights.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-muted">Matches: </span>
            {highlights.join(", ")}
          </p>
        )}

        {tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialties">
            {tags.map((t) => (
              <li key={t} className="rounded-full bg-cream px-2.5 py-0.5 text-xs text-ink-2 ring-1 ring-inset ring-sand">
                {t}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-1 border-t border-line pt-3">
          <TodayHours cafe={cafe} linkTo={`/cafes/${cafe.slug}#hours`} />
          {cafe.address && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <MapPin size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
              <span className="line-clamp-1">{cafe.address.replace(/,?\s*(ON|Ontario)\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d,?\s*(Canada)?$/i, "")}</span>
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
          {cafe.website_url && (
            <a
              href={cafe.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet inline-flex items-center gap-0.5"
              aria-label={insta ? `${cafe.name} on Instagram (${instagramHandle(cafe.website_url)}), opens in a new tab` : `${cafe.name} website, opens in a new tab`}
            >
              {insta ? "Instagram" : "Website"} <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
            </a>
          )}
          <a
            href={googleMapsDirectionsUrl(cafe.name, cafe.address, cafe.google_place_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet inline-flex items-center gap-0.5"
            aria-label={`Directions to ${cafe.name} on Google Maps, opens in a new tab`}
          >
            Directions <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
          </a>
          <Link href={href} className="ml-auto inline-flex items-center rounded-full border border-line px-3 py-1 text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
