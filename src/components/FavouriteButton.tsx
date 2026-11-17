"use client";

import { Heart } from "lucide-react";
import { useFavourites } from "@/lib/favourites";

/** Heart toggle. `overlay` sits on top of a photo; `inline` sits in text. */
export function FavouriteButton({ slug, name, variant = "overlay" }: { slug: string; name: string; variant?: "overlay" | "inline" }) {
  const { isFavourite, toggle } = useFavourites();
  const saved = isFavourite(slug);
  const label = saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={
        variant === "overlay"
          ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)] backdrop-blur transition hover:scale-105 hover:bg-paper"
          : "inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
      }
    >
      <Heart size={variant === "overlay" ? 17 : 16} strokeWidth={1.75} className={saved ? "fill-[#b4532a] text-[#b4532a]" : ""} aria-hidden />
      {variant === "inline" && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
