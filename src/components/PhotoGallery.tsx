"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface GalleryPhoto {
  imageUrl: string;
  authorName: string | null;
  authorUri: string | null;
}

/**
 * Extra Google photos of a cafe (the first one is already the hero). Requested only when the gallery scrolls near
 * the viewport, never cached, and every image carries its "Photo by … · Google Maps" credit.
 * Renders nothing when there are no extra photos (or no key / quota), so there's never an empty box.
 */
export function PhotoGallery({ placeId, name }: { placeId: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [mapsUri, setMapsUri] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ctrl = new AbortController();
    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        try {
          const res = await fetch(`/api/place-photo?placeId=${encodeURIComponent(placeId)}&all=1&w=800`, { cache: "no-store", signal: ctrl.signal });
          if (!res.ok) return setPhotos([]);
          const data = (await res.json()) as { photos: GalleryPhoto[]; googleMapsUri: string | null };
          setPhotos(data.photos.slice(1)); // skip the hero photo
          setMapsUri(data.googleMapsUri);
        } catch {
          setPhotos([]);
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(box.current);
    return () => {
      io.disconnect();
      ctrl.abort();
    };
  }, [placeId]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight" && photos) setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft" && photos) setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos]);

  const credit = (p: GalleryPhoto, light = false) => (
    <>
      Photo by{" "}
      {p.authorUri ? (
        <a href={p.authorUri} target="_blank" rel="noopener noreferrer" className={light ? "underline" : "link-quiet"}>
          {p.authorName ?? "a Google Maps contributor"}
        </a>
      ) : (
        (p.authorName ?? "a Google Maps contributor")
      )}
      {" · "}
      {mapsUri ? (
        <a href={mapsUri} target="_blank" rel="noopener noreferrer" className={light ? "underline" : "link-quiet"}>
          Google Maps
        </a>
      ) : (
        "Google Maps"
      )}
    </>
  );

  return (
    <div ref={box}>
      {photos && photos.length > 0 && (
        <section aria-labelledby="gallery" className="mt-16">
          <h2 id="gallery" className="border-b border-ink pb-3 text-xl font-semibold tracking-tight">
            Photos
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {photos.map((p, i) => (
              <li key={p.imageUrl}>
                <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-lg" aria-label={`Open photo ${i + 1} of ${photos.length}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={`${name}: photo ${i + 2}`} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-[1.04]" />
                </button>
                <p className="mt-1 truncate text-[11px] text-muted">{credit(p)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open !== null && photos && photos[open] && (
        <div role="dialog" aria-modal="true" aria-label={`${name} photos`} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
            <X size={20} strokeWidth={1.5} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[open].imageUrl.replace("w=800", "w=1200")} alt={`${name}: photo ${open + 2}`} className="max-h-[80vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="mt-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
            {credit(photos[open], true)} · {open + 1} / {photos.length}
          </p>
        </div>
      )}
    </div>
  );
}
