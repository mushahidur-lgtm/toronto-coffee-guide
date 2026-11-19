/**
 * Recompute every manifest record's blur placeholder and average colour from its image file (e.g. after changing
 * the placeholder format). Offline; does not touch anything else.   npm run images:blur
 */
import fs from "node:fs";
import path from "node:path";
import { averageColor, makeBlur } from "./approve";
import { loadManifest, PUBLIC_DIR, saveManifest } from "./lib";

async function main() {
  const m = loadManifest();
  let bytes = 0;
  for (const r of m.images) {
    const file = fs.readFileSync(path.join(PUBLIC_DIR, r.file));
    r.blur = await makeBlur(file);
    r.color = await averageColor(file);
    bytes += r.blur.length;
  }
  saveManifest(m);
  console.log(`${m.images.length} placeholder(s) rebuilt, ${Math.round(bytes / m.images.length)} characters each on average`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
