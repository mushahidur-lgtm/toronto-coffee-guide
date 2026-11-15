import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { CafeView } from "@/lib/types";
import { CafePhoto } from "./CafePhoto";
import { Hours } from "./Hours";
import { displayUrl, instagramHandle, isInstagramUrl } from "@/lib/maps";

interface Props {
  cafe: CafeView;
  highlights?: string[];
  priority?: boolean;
}

const MAIN_TYPES = new Set([
  "Specialty Coffee", "Matcha Cafe", "Vietnamese Cafe", "Japanese Cafe", "Korean Cafe", "Bakery & Cafe", "Brunch Cafe", "Dessert Cafe",
]);

export function CafeCard({ cafe, highlights = [], priority }: Props) {
  const specialties = Array.from(new Set([...cafe.specialty_drinks, ...cafe.food_offerings])).slice(0, 5);
  const mainTypes = cafe.cafe_categories.filter((c) => MAIN_TYPES.has(c));
  const types = [
    ...mainTypes,
    // Skip "Japanese" when "Japanese Cafe" is already shown.
    ...cafe.cuisine_types.filter((cu) => !mainTypes.some((t) => t.toLowerCase().startsWith(cu.toLowerCase()))),
  ];
  const typeLine = Array.from(new Set(types.length ? types : cafe.cafe_categories)).slice(0, 3).join(" · ");

  return (
    <article className="flex h-full flex-col">
      <CafePhoto
        photo={cafe.photo}
        placeId={cafe.google_place_id}
        name={cafe.name}
        width={800}
        priority={priority}
        href={`/cafes/${cafe.slug}`}
      />

      <div className="flex flex-1 flex-col pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{cafe.neighbourhood}</p>
        <h3 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">
          <Link href={`/cafes/${cafe.slug}`} className="hover:underline hover:underline-offset-4">
            {cafe.name}
          </Link>
        </h3>
        {typeLine && <p className="mt-1 text-sm text-muted">{typeLine}</p>}
        {cafe.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{cafe.description}</p>}

        {highlights.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-muted">Matches: </span>
            {highlights.join(", ")}
          </p>
        )}

        <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          {specialties.length > 0 && (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Specialties</dt>
              <dd className="mt-1 leading-relaxed">{specialties.join(" · ")}</dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Hours</dt>
            <dd className="mt-1">
              <Hours hours={cafe.opening_hours} />
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5 text-sm">
          {cafe.website_url && (
            <a
              href={cafe.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet inline-flex items-center gap-1"
              aria-label={
                isInstagramUrl(cafe.website_url)
                  ? `${cafe.name} on Instagram (${instagramHandle(cafe.website_url)}), opens in a new tab`
                  : `${cafe.name} website (${displayUrl(cafe.website_url)}), opens in a new tab`
              }
            >
              {isInstagramUrl(cafe.website_url) ? "Instagram" : "Visit website"} <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
            </a>
          )}
          <a
            href={cafe.google_maps_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet inline-flex items-center gap-1"
            aria-label={`View ${cafe.name} on Google Maps, opens in a new tab`}
          >
            <MapPin size={14} strokeWidth={1.5} aria-hidden /> View on Google Maps
          </a>
        </div>
      </div>
    </article>
  );
}
