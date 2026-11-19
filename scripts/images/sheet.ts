/**
 * Build a labelled contact sheet of candidate thumbnails so a human can look at them before approving.
 *
 *   npm run images:sheet -- --category matcha --out <dir> [--max 12] [--skip 12]
 *   npm run images:sheet -- --cafe <cafe-id> --out <dir>
 *   npm run images:sheet -- --venue --out <dir>            # every undecided venue candidate
 *   npm run images:sheet -- --ids a,b,c --out <dir>        # exactly these candidates
 *
 * Writes <dir>/<name>.png (3 columns) and prints the numbered list with ids, licences and source pages.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { arg, flag, loadCandidates, USER_AGENT } from "./lib";

const W = 480;
const H = 330;
const LABEL = 54;
const COLS = 3;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function tile(i: number, title: string, meta: string, url: string | null) {
  let img: Buffer;
  try {
    if (!url) throw new Error("no thumbnail");
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    img = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(W, H, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    img = await sharp({ create: { width: W, height: H, channels: 3, background: "#ddd" } }).jpeg().toBuffer();
  }
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LABEL}"><rect width="${W}" height="${LABEL}" fill="#fff"/>` +
      `<text x="6" y="22" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#000">${i + 1}. ${esc(title.slice(0, 44))}</text>` +
      `<text x="6" y="44" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#444">${esc(meta.slice(0, 60))}</text></svg>`,
  );
  return sharp({ create: { width: W, height: H + LABEL, channels: 3, background: "#fff" } })
    .composite([{ input: img, top: 0, left: 0 }, { input: label, top: H, left: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  const out = arg("out");
  if (!out) throw new Error("--out <dir> is required");
  const max = Number(arg("max") ?? 12);
  const all = loadCandidates().candidates.filter((c) => !c.decision);
  const category = arg("category");
  const cafe = arg("cafe");
  const ids = arg("ids")?.split(",").map((x) => x.trim());
  const list = ids
    ? ids.map((id) => loadCandidates().candidates.find((c) => c.cid === id)).filter((c): c is NonNullable<typeof c> => !!c)
    : category
    ? all.filter((c) => c.scope === "illustrative" && c.category === category)
    : cafe
      ? all.filter((c) => c.cafes.some((x) => x.cafeId === cafe))
      : flag("venue")
        ? all.filter((c) => c.scope === "venue")
        : [];
  const skip = Number(arg("skip") ?? 0);
  const picked = list.slice(skip, skip + max);
  if (!picked.length) {
    console.log("no candidates for that selection");
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  const tiles = await Promise.all(picked.map((c, i) => tile(i, c.title ?? "(untitled)", `${c.license} · ${c.width}x${c.height} · ${c.creator ?? "?"}`, c.thumbUrl ?? c.downloadUrl)));
  const rows = Math.ceil(tiles.length / COLS);
  const name = arg("name") ?? category ?? cafe ?? "venue";
  const file = path.join(out, `${name}.png`);
  await sharp({ create: { width: COLS * W, height: rows * (H + LABEL), channels: 3, background: "#fff" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * W, top: Math.floor(i / COLS) * (H + LABEL) })))
    .png()
    .toFile(file);
  console.log(`sheet: ${file}`);
  picked.forEach((c, i) => console.log(`${i + 1}. ${c.cid}  [${c.license}${c.licenseVersion ? " " + c.licenseVersion : ""}] ${c.width}x${c.height}\n   ${c.title ?? ""}\n   by ${c.creator ?? "?"} · ${c.sourceUrl}${c.cafes.length ? `\n   cafe match: ${c.cafes.map((x) => `${x.cafeId}${x.place ? "" : " (place unconfirmed)"}`).join(", ")}` : ""}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
