import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CafeView } from "@/lib/types";
import type { Collection } from "@/lib/collections";
import { CafePhoto } from "./CafePhoto";

/** Editorial collection card. The image is a real photo of one of the collection's cafes (never stock). */
export function CollectionCard({ collection, cafes }: { collection: Collection; cafes: CafeView[] }) {
  const cover = cafes.find((c) => c.photo) ?? cafes.find((c) => c.google_place_id) ?? cafes[0];
  const href = `/toronto/${collection.slug}`;
  return (
    <article className="group relative flex h-full flex-col">
      <div className="overflow-hidden rounded-lg">
        <div className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none">
          <CafePhoto photo={cover.photo} placeId={cover.google_place_id} name={cover.name} width={800} className="aspect-[3/2]" />
        </div>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">
        <Link href={href} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4">
          {collection.title}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-2">{collection.description}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted transition-colors group-hover:text-ink">
        {cafes.length} {cafes.length === 1 ? "place" : "places"} <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
      </p>
    </article>
  );
}
