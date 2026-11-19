/**
 * Shared helpers for the image curation scripts (npm run images:*). Nothing here runs in the site.
 */
import fs from "node:fs";
import path from "node:path";
import seed from "../../data/cafes.seed.json";
import { normalizeCafe } from "../../src/lib/normalize-cafe";
import type { Cafe } from "../../src/lib/types";
import type { ImageManifest, ImageRecord } from "../../src/lib/images";

export const ROOT = path.resolve(__dirname, "..", "..");
export const MANIFEST_PATH = path.join(ROOT, "data", "cafe-images.json");
export const CANDIDATES_PATH = path.join(ROOT, "data", "image-candidates.json");
export const PUBLIC_DIR = path.join(ROOT, "public");

/** Identifies us to Openverse and Wikimedia (no personal details). */
export const USER_AGENT = "TorontoCoffeeGuide-image-curation/1.0 (+https://toronto-coffee-guide.vercel.app)";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const today = () => new Date().toISOString().slice(0, 10);

export interface Candidate {
  /** "openverse:<uuid>" or "wikimedia:<pageid>" */
  cid: string;
  scope: "venue" | "illustrative";
  source: "openverse" | "wikimedia";
  provider: string;
  /** venue: cafes whose name matched this result (the editor still has to confirm it is that cafe and place). */
  cafes: { cafeId: string; brand: boolean; place: boolean }[];
  /** illustrative: which generic category this was searched for. */
  category: string | null;
  query: string;
  title: string | null;
  creator: string | null;
  creatorUrl: string | null;
  license: "by" | "by-sa" | "cc0" | "pdm";
  licenseVersion: string | null;
  licenseUrl: string | null;
  sourceUrl: string;
  originalUrl: string;
  downloadUrl: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  tags: string[];
  description: string | null;
  foundAt: string;
  decision: "approved" | "rejected" | null;
  reason?: string;
}

export interface CandidateFile {
  version: 1;
  /** "<source>:<key>" → date searched, so a re-run only searches what is new. */
  searched: Record<string, string>;
  candidates: Candidate[];
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export const loadManifest = (): ImageManifest => readJson<ImageManifest>(MANIFEST_PATH, { version: 1, images: [] });
export const saveManifest = (m: ImageManifest) => {
  m.images.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n");
};
export const loadCandidates = (): CandidateFile => readJson<CandidateFile>(CANDIDATES_PATH, { version: 1, searched: {}, candidates: [] });
export const saveCandidates = (f: CandidateFile) => fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(f, null, 2) + "\n");

/** Published cafes (closed ones excluded), as the site sees them from the data file. */
export function loadCafes(): Cafe[] {
  return (seed as Record<string, unknown>[]).map(normalizeCafe).filter((c) => c.verification_status !== "closed");
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

/** GET JSON with polite retries (429 / 5xx) and our User-Agent. */
export async function getJson<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1);
      if (res.status === 429 && wait > 120_000) throw new Error(`rate limited, retry after ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
  }
}

// ---- name matching ---------------------------------------------------------------------------------------------

export const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Words that don't identify a business on their own. */
const GENERIC = new Set(
  "coffee cafe caffe cafes roasters roastery roaster bakery bakeshop patisserie kitchen bar espresso house shop tea teas the and co company café eatery restaurant bistro dessert desserts toronto".split(" "),
);

/** "Balzac's Coffee Roasters — Distillery" → brand "Balzac's Coffee Roasters", branch "Distillery". */
export function splitName(name: string): { brand: string; branch: string | null } {
  const [brand, ...rest] = name.split(/\s+[—–]\s+/);
  return { brand: brand.trim(), branch: rest.length ? rest.join(" ").trim() : null };
}

/** Tokens that must all appear for a result to count as being about this business. */
export function brandTokens(brand: string): string[] {
  const all = norm(brand).split(" ").filter(Boolean);
  const distinct = all.filter((t) => !GENERIC.has(t));
  return distinct.length ? distinct : all;
}

export function textMatchesBrand(text: string, brand: string): boolean {
  const hay = ` ${norm(text)} `;
  const toks = brandTokens(brand);
  return toks.length > 0 && toks.every((t) => hay.includes(` ${t} `) || hay.includes(` ${t}s `));
}

/** Does the text point at this cafe's place: the city, its neighbourhood, branch, or street? */
export function textMatchesPlace(text: string, cafe: Cafe): boolean {
  const hay = ` ${norm(text)} `;
  const { branch } = splitName(cafe.name);
  const street = norm((cafe.address ?? "").split(",")[0]).replace(/^\d+\s*/, "");
  const probes = [norm(cafe.neighbourhood), branch ? norm(branch) : "", street].filter((p) => p.length > 3);
  return probes.some((p) => hay.includes(` ${p} `));
}

export const stripHtml = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type { ImageRecord };
