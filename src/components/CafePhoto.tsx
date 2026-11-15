"use client";

import { useState } from "react";
import type { CafePhoto as Photo } from "@/lib/types";

interface Props {
  photo: Photo | null;
  name: string;
  /** Requested pixel width (Places photos are resized server-side by Google). */
  width?: number;
  className?: string;
  priority?: boolean;
  showAttribution?: boolean;
}

function src(photo: Photo, width: number) {
  return photo.kind === "google"
    ? `/api/places/photo?name=${encodeURIComponent(photo.ref)}&w=${width}`
    : photo.ref;
}

export function CafePhoto({ photo, name, width = 640, className = "aspect-[4/3]", priority, showAttribution = true }: Props) {
  const [failed, setFailed] = useState(false);

  if (!photo || failed) {
    return (
      <div className={`${className} relative flex items-center justify-center overflow-hidden bg-wash`} role="img" aria-label={`No photo available for ${name}`}>
        <span aria-hidden className="select-none text-5xl font-light tracking-tight text-[#cbc6bf]">
          {name.replace(/^the\s+/i, "").charAt(0).toUpperCase()}
        </span>
        <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.12em] text-[#a19b93]">Photo not available</span>
      </div>
    );
  }

  return (
    <figure className="m-0">
      <div className={`${className} overflow-hidden bg-wash`}>
        {/* Plain <img>: Google photo URIs must not be stored/re-hosted by an image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src(photo, width)}
          alt={`${name}: photo`}
          width={width}
          height={Math.round((width * 3) / 4)}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
      {showAttribution && (
        <figcaption>
          <PhotoCredit photo={photo} />
        </figcaption>
      )}
    </figure>
  );
}

/** Author attribution required by Google Maps Platform for Places photos. */
export function PhotoCredit({ photo }: { photo: Photo | null }) {
  if (!photo || (photo.kind !== "google" && !photo.attributions.length)) return null;
  return (
    <p className="mt-1.5 truncate text-[11px] text-muted">
      Photo:{" "}
      {photo.attributions.length
        ? photo.attributions.map((a, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {a.uri ? (
                <a href={a.uri} target="_blank" rel="noopener noreferrer" className="link-quiet">
                  {a.displayName}
                </a>
              ) : (
                a.displayName
              )}
            </span>
          ))
        : "Unknown"}
      {photo.kind === "google" && " · Google Maps"}
    </p>
  );
}
