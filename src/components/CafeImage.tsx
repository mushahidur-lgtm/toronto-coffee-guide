"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Armchair, Coffee, CakeSlice, Croissant, CupSoda, Leaf, type LucideIcon } from "lucide-react";
import { ILLUSTRATIVE_LABELS, type IllustrativeCategory, type ResolvedImage } from "@/lib/images";
import { ImageCredit } from "./ImageCredit";

const ICONS: Record<IllustrativeCategory, LucideIcon> = {
  matcha: Leaf,
  "vietnamese-coffee": Coffee,
  dessert: CakeSlice,
  tea: CupSoda,
  pastry: Croissant,
  "pour-over": Coffee,
  espresso: Coffee,
  "cafe-interior": Armchair,
};

interface Props {
  name: string;
  image: ResolvedImage | null;
  /** Generic category, used for the drawn placeholder. */
  category: IllustrativeCategory;
  /** CSS aspect ratio class. Fixed ratios reserve the space up front, so nothing shifts as images load. */
  className?: string;
  /** Responsive hint for the browser: how wide the image is rendered at each breakpoint. */
  sizes?: string;
  /** Above the fold: preload and don't lazy-load. */
  priority?: boolean;
  /** Makes the image a link (the credit stays outside it, so there are no nested links). */
  href?: string;
  /** "compact" under cards, "full" on the cafe page, "none" to omit. */
  credit?: "compact" | "full" | "none";
  creditClassName?: string;
}

/**
 * One cafe image: the approved photo (AVIF/WebP via the Next.js image optimiser, lazy-loaded, blur-up placeholder,
 * fixed aspect ratio), or, when there is none or the file fails to load, a drawn category placeholder.
 * Illustrative photos carry an on-image label and are described in alt text as "not a photo of <cafe>".
 */
export function CafeImage({ name, image, category, className = "aspect-video", sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw", priority, href, credit = "compact", creditClassName = "mt-1.5" }: Props) {
  const [failed, setFailed] = useState(false);
  const show = image && !failed;
  const alt = image?.alt ?? `Illustrative photo of ${ILLUSTRATIVE_LABELS[category]}, not a photo of ${name}`;

  const frame = (
    <div className={`${className} relative overflow-hidden bg-wash`} style={show ? { backgroundColor: image.color } : undefined}>
      {show ? (
        <>
          <Image
            src={image.src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            {...(image.blur ? { placeholder: "blur" as const, blurDataURL: image.blur } : {})}
            className="object-cover"
            onError={() => setFailed(true)}
          />
          {image.label && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{image.label}</span>
          )}
        </>
      ) : (
        <Placeholder name={name} category={category} />
      )}
    </div>
  );

  return (
    <figure className="m-0 min-w-0">
      {href ? (
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          {frame}
        </Link>
      ) : (
        frame
      )}
      {show && credit !== "none" && <ImageCredit credit={image.credit} variant={credit} className={creditClassName} />}
    </figure>
  );
}

/** Drawn, never a photo: a quiet category icon on a warm tint. */
function Placeholder({ name, category }: { name: string; category: IllustrativeCategory }) {
  const Icon = ICONS[category];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-cream to-sand text-[#b9ada0]" role="img" aria-label={`No photo yet for ${name}`}>
      <Icon size={44} strokeWidth={1.1} aria-hidden />
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#a59a8e]">{ILLUSTRATIVE_LABELS[category]}</span>
    </div>
  );
}
