import manifest from "@data/cafe-images.json";
import type { ImageManifest, ImageRecord } from "./images";

/** Every record in data/cafe-images.json. The site only ever publishes approved, valid ones (see resolveCafeImages). */
export const IMAGE_RECORDS: ImageRecord[] = (manifest as ImageManifest).images;
