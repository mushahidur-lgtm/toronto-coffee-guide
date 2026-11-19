/**
 * Find CANDIDATE photos for each cafe in Openverse and Wikimedia Commons. Nothing is published by this script:
 * results go to data/image-candidates.json for a human to review, and only `images:approve` adds an image to the
 * manifest the site reads.
 *
 *   npm run images:search                        # every brand not searched yet
 *   npm run images:search -- --only <cafe-id>    # one cafe (and its brand)
 *   npm run images:search -- --limit 20          # stop after 20 brand searches (daily quota friendly)
 *   npm run images:search -- --no-wikimedia      # or --no-openverse
 *
 * Openverse (https://api.openverse.org/v1/) allows 20 requests/minute and 200/day without credentials, so the script
 * paces itself and remembers what it has searched; run it again tomorrow to continue. Only licences we can publish
 * under are requested: CC BY, CC BY-SA, CC0 and Public Domain Mark (no NonCommercial, no NoDerivatives).
 * Results are kept only when the title, tags or description contain the cafe's distinctive name words.
 */
import {
  arg, flag, getJson, loadCafes, loadCandidates, saveCandidates, sleep, splitName, stripHtml, textMatchesBrand, textMatchesPlace, today,
  type Candidate,
} from "./lib";

const OPENVERSE = "https://api.openverse.org/v1/images/";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const MIN_W = 800;

interface OvResult {
  id: string; title: string | null; creator: string | null; creator_url: string | null; url: string; thumbnail: string | null;
  foreign_landing_url: string; license: string; license_version: string | null; license_url: string | null; provider: string | null;
  tags: { name: string }[] | null; width: number | null; height: number | null; filetype: string | null;
}

const OK_LICENSES = new Set(["by", "by-sa", "cc0", "pdm"]);

/** One page of results. Anonymous Openverse requests are limited to 20 per page (a larger page_size is a 401). */
export async function openverseSearch(query: string, pageSize = 20): Promise<OvResult[]> {
  const params = new URLSearchParams({
    q: query, license: "by,by-sa,cc0,pdm", mature: "false", page_size: String(pageSize),
    fields: "id,title,creator,creator_url,url,thumbnail,foreign_landing_url,license,license_version,license_url,provider,tags,width,height,filetype",
  });
  const data = await getJson<{ results: OvResult[] }>(`${OPENVERSE}?${params}`);
  return data.results.filter((r) => OK_LICENSES.has(r.license) && /jpe?g|png|webp/i.test(r.filetype ?? "jpg"));
}

interface CommonsPage {
  pageid: number; title: string;
  imageinfo?: { url: string; thumburl?: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[];
}

export function commonsLicense(short: string | undefined): { license: Candidate["license"]; version: string | null } | null {
  const s = (short ?? "").trim();
  let m = s.match(/^CC BY-SA (\d\.\d)/i);
  if (m) return { license: "by-sa", version: m[1] };
  m = s.match(/^CC BY (\d\.\d)/i);
  if (m) return { license: "by", version: m[1] };
  if (/^CC0/i.test(s)) return { license: "cc0", version: "1.0" };
  if (/^(public domain|pd[- ])/i.test(s)) return { license: "pdm", version: null };
  return null; // GFDL, "fair use", unknown: not publishable here
}

export async function commonsSearch(query: string, limit = 10): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: String(limit),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|Restrictions",
  });
  const data = await getJson<{ query?: { pages?: Record<string, CommonsPage> } }>(`${COMMONS}?${params}`);
  return Object.values(data.query?.pages ?? {});
}

async function main() {
  const cafes = loadCafes();
  const only = arg("only");
  const limit = Number(arg("limit") ?? Infinity);
  const doOv = !flag("no-openverse");
  const doWm = !flag("no-wikimedia");
  const file = loadCandidates();
  const known = new Set(file.candidates.map((c) => c.cid + "|" + c.cafes.map((x) => x.cafeId).join(",")));

  // One search per brand: "Pilot Coffee Roasters — Yorkville" and "— Wagstaff" share one query.
  const groups = new Map<string, { brand: string; cafes: typeof cafes }>();
  for (const c of cafes) {
    if (only && c.id !== only) continue;
    const { brand } = splitName(c.name);
    const key = brand.toLowerCase();
    groups.set(key, { brand, cafes: [...(groups.get(key)?.cafes ?? []), c] });
  }

  let done = 0;
  let added = 0;
  for (const [key, g] of groups) {
    if (done >= limit) break;
    const query = `${g.brand} Toronto`;
    const raw: { src: "openverse" | "wikimedia"; cand: Omit<Candidate, "cafes" | "foundAt" | "decision" | "query" | "scope" | "category"> }[] = [];

    if (doOv && !file.searched[`openverse:${key}`]) {
      try {
        for (const r of await openverseSearch(query)) {
          if ((r.width ?? 0) < MIN_W) continue;
          raw.push({
            src: "openverse",
            cand: {
              cid: `openverse:${r.id}`, source: "openverse", provider: r.provider ?? "openverse", title: r.title, creator: r.creator, creatorUrl: r.creator_url,
              license: r.license as Candidate["license"], licenseVersion: r.license_version, licenseUrl: r.license_url, sourceUrl: r.foreign_landing_url,
              originalUrl: r.url, downloadUrl: r.url, thumbUrl: r.thumbnail, width: r.width ?? 0, height: r.height ?? 0,
              tags: (r.tags ?? []).map((t) => t.name), description: null,
            },
          });
        }
        file.searched[`openverse:${key}`] = today();
      } catch (e) {
        console.error(`openverse "${query}": ${(e as Error).message}. Stopping; run again later to continue.`);
        saveCandidates(file);
        process.exit(1);
      }
      await sleep(3200); // stay under 20 requests/minute
    }

    if (doWm && !file.searched[`wikimedia:${key}`]) {
      try {
        for (const p of await commonsSearch(query)) {
          const info = p.imageinfo?.[0];
          if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || info.width < MIN_W) continue;
          const md = info.extmetadata ?? {};
          const lic = commonsLicense(md.LicenseShortName?.value);
          if (!lic) continue;
          raw.push({
            src: "wikimedia",
            cand: {
              cid: `wikimedia:${p.pageid}`, source: "wikimedia", provider: "wikimedia", title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""),
              creator: stripHtml(md.Artist?.value) || null, creatorUrl: null, license: lic.license, licenseVersion: lic.version,
              licenseUrl: md.LicenseUrl?.value ?? null, sourceUrl: info.descriptionurl, originalUrl: info.url, downloadUrl: info.thumburl ?? info.url,
              thumbUrl: info.thumburl ?? null, width: info.width, height: info.height, tags: [], description: stripHtml(md.ImageDescription?.value) || null,
            },
          });
        }
        file.searched[`wikimedia:${key}`] = today();
      } catch (e) {
        console.error(`wikimedia "${query}": ${(e as Error).message}`);
      }
      await sleep(400);
    }

    for (const { cand } of raw) {
      const text = [cand.title, cand.description, ...cand.tags].filter(Boolean).join(" ");
      const matched = g.cafes
        .filter(() => textMatchesBrand(text, g.brand))
        .map((c) => ({ cafeId: c.id, brand: true, place: textMatchesPlace(text, c) || /toronto/i.test(text) }));
      if (!matched.length) continue;
      const sig = cand.cid + "|" + matched.map((x) => x.cafeId).join(",");
      if (known.has(sig)) continue;
      known.add(sig);
      file.candidates.push({ ...cand, scope: "venue", category: null, query, cafes: matched, foundAt: today(), decision: null });
      added++;
    }
    done++;
    saveCandidates(file);
    process.stderr.write(`\r${done}/${groups.size} brands · ${added} candidates `);
  }
  process.stderr.write("\n");
  const open = file.candidates.filter((c) => c.scope === "venue" && !c.decision).length;
  console.log(`searched ${done} brand(s); ${added} new candidate(s); ${open} venue candidate(s) awaiting review`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
