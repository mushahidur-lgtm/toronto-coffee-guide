/**
 * Validate the image manifest. Exits 1 on any problem, so it can gate a deploy.
 *
 *   npm run images:check               # offline: records, attribution, licences, files, duplicates
 *   npm run images:check -- --online   # also confirms every source page still loads (run monthly)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { validateManifest } from "../../src/lib/images";
import { flag, loadCafes, loadManifest, PUBLIC_DIR, sleep, USER_AGENT } from "./lib";

async function main() {
  const manifest = loadManifest();
  const cafeIds = new Set(loadCafes().map((c) => c.id));
  const problems = validateManifest(manifest.images, cafeIds).map((p) => `${p.id}: ${p.issue}`);
  const warnings: string[] = [];
  const hashes = new Map<string, string>();

  for (const r of manifest.images) {
    const abs = path.join(PUBLIC_DIR, r.file);
    if (!fs.existsSync(abs)) {
      problems.push(`${r.id}: file missing (${r.file})`);
      continue;
    }
    const buf = fs.readFileSync(abs);
    const meta = await sharp(buf).metadata();
    if (meta.width !== r.width || meta.height !== r.height) problems.push(`${r.id}: recorded ${r.width}x${r.height} but file is ${meta.width}x${meta.height}`);
    const h = crypto.createHash("sha1").update(buf).digest("hex");
    if (hashes.has(h)) problems.push(`${r.id}: identical file to ${hashes.get(h)}`);
    hashes.set(h, r.id);
    if (r.lastVerified && Date.now() - Date.parse(r.lastVerified) > 365 * 86400_000) warnings.push(`${r.id}: not re-verified since ${r.lastVerified}`);
    if (buf.length > 600 * 1024) warnings.push(`${r.id}: ${(buf.length / 1024).toFixed(0)} KB is large for a card image`);
  }

  // Files on disk that no record points at (leftovers from a removed image).
  const referenced = new Set(manifest.images.map((r) => path.normalize(path.join(PUBLIC_DIR, r.file))));
  const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  for (const f of walk(path.join(PUBLIC_DIR, "images"))) if (!referenced.has(path.normalize(f)) && !f.endsWith(".gitkeep")) warnings.push(`orphan file ${path.relative(PUBLIC_DIR, f)}`);

  if (flag("online")) {
    for (const r of manifest.images) {
      try {
        const res = await fetch(r.sourceUrl, { method: "GET", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
        if (!res.ok) problems.push(`${r.id}: source page returned HTTP ${res.status} (${r.sourceUrl})`);
      } catch (e) {
        problems.push(`${r.id}: source page unreachable (${(e as Error).message})`);
      }
      await sleep(500);
    }
  }

  const approved = manifest.images.filter((r) => r.approval === "approved").length;
  console.log(`${manifest.images.length} record(s), ${approved} approved`);
  for (const w of warnings) console.log("warn  " + w);
  for (const p of problems) console.log("FAIL  " + p);
  console.log(problems.length ? `\n${problems.length} problem(s)` : "\nmanifest OK");
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
