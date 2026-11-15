"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CafePhoto as Photo } from "@/lib/types";

interface Props {
  name: string;
  /** Own/licensed photo. Takes priority over Google. */
  photo: Photo | null;
  /** Google Place ID. When set (and there's no editorial photo) a live Google photo loads lazily. */
  placeId?: string | null;
  /** Requested pixel width for Google photos. */
  width?: number;
  className?: string;
  /** Above-the-fold: load immediately instead of waiting for the viewport. */
  priority?: boolean;
  /** Makes the image a link (the attribution stays outside it). */
  href?: string;
}

interface GooglePhoto {
  imageUrl: string;
  authorName: string | null;
  authorUri: string | null;
  googleMapsUri: string | null;
}

type State = { status: "idle" | "loading" | "none" } | { status: "ready"; photo: GooglePhoto };

/**
 * Cafe image with three sources, in order: editorial photo → live Google Places photo → placeholder.
 * Google photos are requested only when the image nears the viewport (IntersectionObserver), are never
 * cached (the API route sends no-store), and always show "Photo by … · Google Maps" beneath them.
 */
export function CafePhoto({ name, photo, placeId, width = 800, className = "aspect-[4/3]", priority, href }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const useGoogle = !photo && !!placeId;
  const [state, setState] = useState<State>({ status: useGoogle ? "idle" : "none" });
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!useGoogle || !box.current) return;
    const ctrl = new AbortController();
    let started = false;

    const load = async () => {
      if (started) return;
      started = true;
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/place-photo?placeId=${encodeURIComponent(placeId!)}&w=${width}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        // 429 (quota), 503 (no key), 404, 502 … all fall back to the placeholder.
        if (!res.ok) return setState({ status: "none" });
        const data = (await res.json()) as {
          photo: { imageUrl: string; authorName: string | null; authorUri: string | null } | null;
          googleMapsUri: string | null;
        };
        setState(data.photo ? { status: "ready", photo: { ...data.photo, googleMapsUri: data.googleMapsUri } } : { status: "none" });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState({ status: "none" });
      }
    };

    if (priority || typeof IntersectionObserver === "undefined") {
      load();
      return () => ctrl.abort();
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "300px 0px" }, // start a little before it scrolls into view
    );
    io.observe(box.current);
    return () => {
      io.disconnect();
      ctrl.abort();
    };
  }, [useGoogle, placeId, width, priority]);

  let image: React.ReactNode;
  let credit: React.ReactNode = null;

  if (photo && !imgFailed) {
    image = <Img src={photo.ref} alt={`${name}: photo`} width={width} priority={priority} onError={() => setImgFailed(true)} />;
    if (photo.attributions.length) credit = <>Photo: {photo.attributions.map((a) => a.displayName).join(", ")}</>;
  } else if (state.status === "ready" && !imgFailed) {
    const p = state.photo;
    image = <Img src={p.imageUrl} alt={`${name}: photo from Google Maps`} width={width} priority={priority} onError={() => setImgFailed(true)} />;
    credit = (
      <>
        Photo by{" "}
        {p.authorUri ? (
          <a href={p.authorUri} target="_blank" rel="noopener noreferrer" className="link-quiet">
            {p.authorName ?? "a Google Maps contributor"}
          </a>
        ) : (
          (p.authorName ?? "a Google Maps contributor")
        )}
        {" · "}
        {p.googleMapsUri ? (
          <a href={p.googleMapsUri} target="_blank" rel="noopener noreferrer" className="link-quiet">
            Google Maps
          </a>
        ) : (
          "Google Maps"
        )}
      </>
    );
  } else if (state.status === "idle" || state.status === "loading") {
    image = <div className="h-full w-full bg-wash" aria-hidden />; // quiet, neutral box while the photo loads
  } else {
    image = <Placeholder name={name} />;
  }

  const frame = (
    <div ref={box} className={`${className} relative overflow-hidden bg-wash`} aria-busy={state.status === "loading" || undefined}>
      {image}
    </div>
  );

  return (
    <figure className="m-0">
      {href ? (
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          {frame}
        </Link>
      ) : (
        frame
      )}
      {credit && <figcaption className="mt-1.5 truncate text-[11px] text-muted">{credit}</figcaption>}
    </figure>
  );
}

function Img({ src, alt, width, priority, onError }: { src: string; alt: string; width: number; priority?: boolean; onError: () => void }) {
  return (
    // Plain <img>: Google photos must not pass through an image optimizer cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={Math.round((width * 3) / 4)}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className="h-full w-full object-cover"
      onError={onError}
    />
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" role="img" aria-label={`No photo available for ${name}`}>
      <span aria-hidden className="select-none text-5xl font-light tracking-tight text-[#cbc6bf]">
        {name.replace(/^the\s+/i, "").charAt(0).toUpperCase()}
      </span>
      <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.12em] text-[#a19b93]">Photo not available</span>
    </div>
  );
}
