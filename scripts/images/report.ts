/**
 * Image coverage report → docs/image-report.md. Offline: reads the data file and the manifest only (no Google
 * or Openverse calls).   npm run images:report
 */
import fs from "node:fs";
import path from "node:path";
import { illustrativeCategory, ILLUSTRATIVE_LABELS, licenseLabel, resolveCafeImages, type ImageRecord } from "../../src/lib/images";
import { loadCafes, loadManifest, ROOT, today } from "./lib";

const cafes = loadCafes();
const records: ImageRecord[] = loadManifest().images;

const rows = cafes.map((c) => ({ c, imgs: resolveCafeImages(c, records) }));
const venue = rows.filter((r) => r.imgs.primary?.scope === "venue");
const illustrative = rows.filter((r) => r.imgs.primary?.scope === "illustrative");
const none = rows.filter((r) => !r.imgs.primary);
const approved = records.filter((r) => r.approval === "approved");

const out: string[] = [];
out.push(`# Image report`, ``, `Generated ${today()} by \`npm run images:report\`. Source of truth: \`data/cafe-images.json\`.`, ``);
out.push(`## Coverage of ${cafes.length} published cafes`, ``, `| | Cafes |`, `| --- | ---: |`);
out.push(`| Own approved photo (venue) | ${venue.length} |`);
out.push(`| Labelled illustrative photo | ${illustrative.length} |`);
out.push(`| Drawn category placeholder | ${none.length} |`);
out.push(`| With extra gallery photos | ${rows.filter((r) => r.imgs.gallery.length).length} |`, ``);

out.push(`## Approved images`, ``, `| | Count |`, `| --- | ---: |`);
out.push(`| Venue photos | ${approved.filter((r) => r.scope === "venue").length} |`);
out.push(`| Illustrative photos | ${approved.filter((r) => r.scope === "illustrative").length} |`);
for (const src of ["official", "submitted", "openverse", "wikimedia", "pexels", "unsplash"]) {
  const n = approved.filter((r) => r.source === src).length;
  if (n) out.push(`| From ${src} | ${n} |`);
}
out.push(``);
const byLic = new Map<string, number>();
for (const r of approved) byLic.set(licenseLabel(r), (byLic.get(licenseLabel(r)) ?? 0) + 1);
if (byLic.size) out.push(`Licences: ${[...byLic].map(([k, v]) => `${k} ×${v}`).join(", ")}`, ``);

out.push(`## Cafes with their own photo`, ``);
out.push(venue.length ? venue.map((r) => `- ${r.c.name} (${r.c.neighbourhood}): ${1 + r.imgs.gallery.length} photo(s)`).join("\n") : "None yet.", ``);

const cats = new Map<string, number>();
for (const r of [...illustrative, ...none]) cats.set(illustrativeCategory(r.c), (cats.get(illustrativeCategory(r.c)) ?? 0) + 1);
out.push(`## Cafes without their own photo, by fallback category`, ``, `| Category | Cafes | Approved illustrative photos |`, `| --- | ---: | ---: |`);
for (const [cat, n] of [...cats].sort((a, b) => b[1] - a[1])) {
  const have = approved.filter((r) => r.scope === "illustrative" && r.category === cat).length;
  out.push(`| ${ILLUSTRATIVE_LABELS[cat as keyof typeof ILLUSTRATIVE_LABELS]} | ${n} | ${have} |`);
}
out.push(``);

fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "image-report.md"), out.join("\n"));
console.log(`cafes ${cafes.length} · own photo ${venue.length} · illustrative ${illustrative.length} · placeholder ${none.length}`);
console.log("wrote docs/image-report.md");
