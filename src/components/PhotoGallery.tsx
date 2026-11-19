"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ResolvedImage } from "@/lib/images";
import { ImageCredit } from "./ImageCredit";

/**
 * More approved photos of a cafe (the hero is separate). Images come from the curated manifest, so there is no
 * network lookup on view. Renders nothing when there are none. Each photo keeps its attribution, including in the
 * lightbox (Esc closes, arrow keys move).
 */
export function PhotoGallery({ images, name }: { images: ResolvedImage[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const photos = images.filter((p) => !broken.has(p.id));

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;
  const current = open !== null ? photos[open] : null;

  return (
    <section aria-labelledby="gallery" className="mt-16">
      <h2 id="gallery" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
        Photos
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} className="relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-wash" aria-label={`Open photo ${i + 1} of ${photos.length}`}>
              <Image
                src={p.src}
                alt={p.alt ?? ""}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                {...(p.blur ? { placeholder: "blur" as const, blurDataURL: p.blur } : {})}
                className="object-cover transition-transform duration-500 hover:scale-[1.04]"
                onError={() => setBroken((b) => new Set(b).add(p.id))}
              />
            </button>
            <ImageCredit credit={p.credit} variant="compact" className="mt-1" />
          </li>
        ))}
      </ul>

      {current && (
        <div role="dialog" aria-modal="true" aria-label={`${name} photos`} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
            <X size={20} strokeWidth={1.5} />
          </button>
          <div className="relative h-[75vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <Image src={current.src} alt={current.alt ?? ""} fill sizes="100vw" className="rounded-lg object-contain" />
          </div>
          <div className="mt-3 max-w-3xl text-center [&_a]:text-white [&_p]:!text-white/80" onClick={(e) => e.stopPropagation()}>
            <ImageCredit credit={current.credit} />
            <p className="mt-1 text-sm text-white/70">
              {(open ?? 0) + 1} / {photos.length}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
