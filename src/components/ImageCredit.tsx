import type { ResolvedImage } from "@/lib/images";

type Credit = ResolvedImage["credit"];

const A = "link-quiet";

/**
 * Attribution for an image, rendered from its manifest record so it can never be left out or drift from the source:
 *   full:     “Title” by Creator via Flickr · CC BY 2.0
 *   compact:  Photo: Creator · CC BY 2.0   (for cards, where space is tight)
 * The creator links to their profile (or the source page), the licence to the licence text.
 */
export function ImageCredit({ credit, variant = "full", className = "" }: { credit: Credit; variant?: "full" | "compact"; className?: string }) {
  const who = credit.creator ?? "Unknown author";
  const creator = (
    <a href={credit.creatorUrl ?? credit.sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" className={A}>
      {who}
    </a>
  );
  const licence = credit.licenseUrl ? (
    <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className={A}>
      {credit.license}
    </a>
  ) : (
    <>{credit.license}</>
  );

  if (variant === "compact") {
    return (
      <p className={`truncate text-[11px] text-muted ${className}`}>
        Photo: {creator} · {licence}
      </p>
    );
  }
  return (
    <p className={`text-[12px] leading-relaxed text-muted ${className}`}>
      {credit.title && credit.sourceUrl ? (
        <>
          <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={A}>
            “{credit.title}”
          </a>{" "}
          by{" "}
        </>
      ) : (
        <>Photo by </>
      )}
      {creator}
      {credit.provider && <> via {credit.provider}</>} · {licence}
    </p>
  );
}
