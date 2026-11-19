import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CafeView } from "@/lib/types";
import type { Collection } from "@/lib/collections";
import { CafeImage } from "./CafeImage";

/** Editorial collection card. Cover: a real photo of one of its cafes if any has one, else an illustrative photo (labelled) or a drawn placeholder. */
export function CollectionCard({ collection, cafes }: { collection: Collection; cafes: CafeView[] }) {
  const cover = cafes.find((c) => c.image?.scope === "venue") ?? cafes.find((c) => c.image) ?? cafes[0];
  const href = `/toronto/${collection.slug}`;
  return (
    <article className="group relative flex h-full flex-col">
      <div className="overflow-hidden rounded-lg">
        <div className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none">
          <CafeImage name={cover.name} image={cover.image} category={cover.image_category} className="aspect-[3/2]" credit="compact" creditClassName="relative z-10 mt-1.5" />
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
