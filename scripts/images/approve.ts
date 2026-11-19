/**
 * Approve (or reject) one candidate. Approving downloads the image, checks it, re-encodes it as an optimised JPEG
 * under public/images, makes a tiny blur placeholder, and adds the record to data/cafe-images.json, the only file
 * the site publishes from.
 *
 *   npm run images:approve -- <candidate-id> --cafe <cafe-id> --by "Your name" [--role primary|gallery]
 *        [--category exterior|interior|drink|food|other] [--alt "Describe the photo"] [--note "why it's right"]
 *   npm run images:approve -- <candidate-id> --illustrative <category> --by "Your name" [--alt "..."]
 *   npm run images:approve -- <candidate-id> --reject --reason "Different location"
 *
 * Only approve a venue photo after confirming it really shows that cafe at that location (signage, the listing
 * text, or the photographer's description). Generic photos must be approved as --illustrative, never as the cafe.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { ILLUSTRATIVE_CATEGORIES, ILLUSTRATIVE_LABELS, MIN_HERO_RATIO, MIN_WIDTH, VENUE_CATEGORIES, validateRecord, type ImageRecord, type IllustrativeCategory } from "../../src/lib/images";
import { arg, flag, loadCafes, loadCandidates, loadManifest, PUBLIC_DIR, saveCandidates, saveManifest, today, USER_AGENT } from "./lib";

const MAX_BYTES = 30 * 1024 * 1024;
const OUT_WIDTH = 1600;

export async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`not an image (content-type "${type}")`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("image is over 30 MB");
  return buf;
}

/** Orientation-aware size of the original. */
async function originalSize(buf: Buffer) {
  const m = await sharp(buf).metadata();
  const swap = (m.orientation ?? 1) >= 5;
  return { width: (swap ? m.height : m.width) ?? 0, height: (swap ? m.width : m.height) ?? 0 };
}

/** About 10px wide WebP as a data URL (~100 bytes): the blur-up placeholder shown while the real image loads. */
export async function makeBlur(img: Buffer): Promise<string> {
  const b = await sharp(img).resize({ width: 10 }).webp({ quality: 30 }).toBuffer();
  return `data:image/webp;base64,${b.toString("base64")}`;
}

/** Average colour of the image as #rrggbb. */
export async function averageColor(img: Buffer): Promise<string> {
  const { data } = await sharp(img).resize(1, 1, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return "#" + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export async function optimise(buf: Buffer) {
  const size = await originalSize(buf);
  const out = await sharp(buf).rotate().resize({ width: OUT_WIDTH, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const blur = await makeBlur(out.data);
  const color = await averageColor(out.data);
  return {
    original: size,
    data: out.data,
    width: out.info.width,
    height: out.info.height,
    blur,
    color,
    hash: crypto.createHash("sha1").update(out.data).digest("hex").slice(0, 8),
  };
}

async function main() {
  const cid = process.argv[2];
  if (!cid || cid.startsWith("--")) throw new Error("usage: images:approve -- <candidate-id> --cafe <id> | --illustrative <category> | --reject");
  const cf = loadCandidates();
  const cand = cf.candidates.find((c) => c.cid === cid);
  if (!cand) throw new Error(`no candidate "${cid}" in data/image-candidates.json`);

  if (flag("reject")) {
    cand.decision = "rejected";
    cand.reason = arg("reason") ?? "rejected";
    saveCandidates(cf);
    console.log(`rejected ${cid}: ${cand.reason}`);
    return;
  }

  const by = arg("by");
  if (!by) throw new Error("--by \"Name\" is required: approvals are attributed to a person");
  const cafeId = arg("cafe");
  const category = arg("illustrative");
  if (!!cafeId === !!category) throw new Error("give exactly one of --cafe <id> or --illustrative <category>");

  const manifest = loadManifest();
  if (manifest.images.some((r) => r.originalUrl === cand.originalUrl)) throw new Error("this original image is already in the manifest");

  let alt = arg("alt");
  let record: Omit<ImageRecord, "file" | "width" | "height" | "blur" | "color" | "id">;
  let dir: string;
  let publicPath: (hash: string) => string;
  let idBase: string;

  if (cafeId) {
    const cafe = loadCafes().find((c) => c.id === cafeId);
    if (!cafe) throw new Error(`unknown cafe id "${cafeId}"`);
    if (cand.scope !== "venue") throw new Error("this candidate was found as an illustrative image; approve it with --illustrative");
    const vcat = arg("category") ?? "other";
    if (!(VENUE_CATEGORIES as readonly string[]).includes(vcat)) throw new Error(`--category must be one of ${VENUE_CATEGORIES.join(", ")}`);
    const role = (arg("role") ?? "gallery") as "primary" | "gallery";
    const n = manifest.images.filter((r) => r.cafeId === cafeId).length + 1;
    alt = alt ?? `${cafe.name}, ${vcat}`;
    dir = path.join(PUBLIC_DIR, "images", "cafes", cafeId);
    publicPath = (h) => `/images/cafes/${cafeId}/${n}-${h}.jpg`;
    idBase = cafeId;
    record = { cafeId, scope: "venue", category: vcat, role, source: cand.source, provider: cand.provider, alt, title: cand.title, creator: cand.creator, creatorUrl: cand.creatorUrl, license: cand.license, licenseVersion: cand.licenseVersion, licenseUrl: cand.licenseUrl, sourceUrl: cand.sourceUrl, originalUrl: cand.originalUrl, approval: "approved", approvedBy: by, approvedAt: today(), lastVerified: today(), notes: arg("note") };
  } else {
    if (!(ILLUSTRATIVE_CATEGORIES as readonly string[]).includes(category!)) throw new Error(`--illustrative must be one of ${ILLUSTRATIVE_CATEGORIES.join(", ")}`);
    alt = alt ?? `Illustrative photo of ${ILLUSTRATIVE_LABELS[category as IllustrativeCategory]}`;
    dir = path.join(PUBLIC_DIR, "images", "illustrative");
    publicPath = (h) => `/images/illustrative/${category}-${h}.jpg`;
    idBase = `illustrative-${category}`;
    record = { cafeId: null, scope: "illustrative", category: category!, role: "primary", source: cand.source, provider: cand.provider, alt, title: cand.title, creator: cand.creator, creatorUrl: cand.creatorUrl, license: cand.license, licenseVersion: cand.licenseVersion, licenseUrl: cand.licenseUrl, sourceUrl: cand.sourceUrl, originalUrl: cand.originalUrl, approval: "approved", approvedBy: by, approvedAt: today(), lastVerified: today(), notes: arg("note") };
  }

  const buf = await downloadImage(cand.downloadUrl);
  const img = await optimise(buf);
  if (img.original.width < MIN_WIDTH) throw new Error(`image is only ${img.original.width}px wide (minimum ${MIN_WIDTH})`);
  const ratio = img.width / img.height;
  if (ratio < 0.6 || ratio > 3) throw new Error(`aspect ratio ${ratio.toFixed(2)} is too extreme for cards`);
  if (record.role === "primary" && ratio < MIN_HERO_RATIO) throw new Error(`portrait/square image (${ratio.toFixed(2)}): use --role gallery, hero images need to be landscape`);

  const file = publicPath(img.hash);
  if (manifest.images.some((r) => r.file.endsWith(`-${img.hash}.jpg`) && r.scope === record.scope && r.cafeId === record.cafeId)) throw new Error("an identical image is already in the manifest");
  if (record.role === "primary" && record.cafeId && manifest.images.some((r) => r.cafeId === record.cafeId && r.role === "primary" && r.approval === "approved")) {
    throw new Error(`cafe "${record.cafeId}" already has a primary image; use --role gallery or remove the old one first`);
  }

  const full: ImageRecord = { ...record, id: `${idBase}-${img.hash}`, file, width: img.width, height: img.height, blur: img.blur, color: img.color };
  const issues = validateRecord(full);
  if (issues.length) throw new Error("record is not publishable:\n - " + issues.join("\n - "));

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, file), img.data);
  manifest.images.push(full);
  saveManifest(manifest);
  cand.decision = "approved";
  saveCandidates(cf);
  console.log(`approved ${full.id}\n  ${file}  ${img.width}x${img.height}  ${(img.data.length / 1024).toFixed(0)} KB  ${full.license}${full.licenseVersion ? " " + full.licenseVersion : ""}`);
}

if (require.main === module) main().catch((e) => { console.error("ERROR:", (e as Error).message); process.exit(1); });
