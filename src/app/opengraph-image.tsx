import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({ eyebrow: "Toronto, Ontario", title: SITE.tagline, subtitle: SITE.description });
}
