/**
 * Find CANDIDATE generic photos for the illustrative fallback (matcha, Vietnamese coffee, pastries, ...). These are
 * shown on cafes that have no approved photo of their own, always labelled "Illustrative photo", and never as the cafe.
 *
 *   npm run images:illustrative                  # all categories
 *   npm run images:illustrative -- --category matcha
 *
 * Landscape, at least 1000px wide (Openverse) or 1400px (Wikimedia Commons), commercial-use licences only. A human picks
 * from the candidates (see images:sheet).
 */
import { ILLUSTRATIVE_CATEGORIES, type IllustrativeCategory } from "../../src/lib/images";
import { arg, loadCandidates, saveCandidates, sleep, today, type Candidate } from "./lib";
import { commonsLicense, commonsSearch, openverseSearch } from "./search";
import { stripHtml } from "./lib";

const QUERIES: Record<IllustrativeCategory, string[]> = {
  matcha: ["matcha latte", "matcha green tea whisk"],
  "vietnamese-coffee": ["vietnamese coffee phin", "ca phe sua da"],
  dessert: ["bingsu", "mochi dessert cafe"],
  tea: ["bubble tea", "milk tea cup"],
  pastry: ["croissant", "pastries bakery counter"],
  "pour-over": ["pour over coffee", "specialty coffee brewing"],
  espresso: ["espresso latte art", "cappuccino cup cafe"],
  "cafe-interior": ["cafe interior", "coffee shop interior"],
};

async function main() {
  const only = arg("category");
  const file = loadCandidates();
  const have = new Set(file.candidates.map((c) => `${c.cid}|${c.category}`));
  let added = 0;
  for (const cat of ILLUSTRATIVE_CATEGORIES) {
    if (only && cat !== only) continue;
    for (const q of QUERIES[cat]) {
      const key = `illustrative:openverse:${q}`;
      if (file.searched[key]) continue;
      let results;
      try {
        results = await openverseSearch(q, 20);
      } catch (e) {
        console.error(`"${q}": ${(e as Error).message}. Run again later to continue.`);
        saveCandidates(file);
        process.exit(1);
      }
      for (const r of results) {
        if ((r.width ?? 0) < 1000 || (r.width ?? 0) / (r.height ?? 1) < 1.3) continue;
        const cid = `openverse:${r.id}`;
        if (have.has(`${cid}|${cat}`)) continue;
        have.add(`${cid}|${cat}`);
        const c: Candidate = {
          cid, scope: "illustrative", source: "openverse", provider: r.provider ?? "openverse", cafes: [], category: cat, query: q, title: r.title, creator: r.creator,
          creatorUrl: r.creator_url, license: r.license as Candidate["license"], licenseVersion: r.license_version, licenseUrl: r.license_url, sourceUrl: r.foreign_landing_url,
          originalUrl: r.url, downloadUrl: r.url, thumbUrl: r.thumbnail, width: r.width ?? 0, height: r.height ?? 0, tags: (r.tags ?? []).map((t) => t.name), description: null,
          foundAt: today(), decision: null,
        };
        // The same photo can be a candidate for two categories; make the cid unique per category.
        c.cid = `${cid}#${cat}`;
        file.candidates.push(c);
        added++;
      }
      file.searched[key] = today();
      await sleep(3200);

      // Wikimedia Commons: usually larger files, and every one has a stated licence and author.
      const wkey = `illustrative:wikimedia:${q}`;
      if (!file.searched[wkey]) {
        try {
          for (const p of await commonsSearch(q, 20)) {
            const info = p.imageinfo?.[0];
            if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || info.width < 1400 || info.width / info.height < 1.3) continue;
            const md = info.extmetadata ?? {};
            const lic = commonsLicense(md.LicenseShortName?.value);
            if (!lic) continue;
            const cid = `wikimedia:${p.pageid}#${cat}`;
            if (have.has(cid)) continue;
            have.add(cid);
            file.candidates.push({
              cid, scope: "illustrative", source: "wikimedia", provider: "wikimedia", cafes: [], category: cat, query: q,
              title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), creator: stripHtml(md.Artist?.value) || null, creatorUrl: null,
              license: lic.license, licenseVersion: lic.version, licenseUrl: md.LicenseUrl?.value ?? null, sourceUrl: info.descriptionurl,
              originalUrl: info.url, downloadUrl: info.thumburl ?? info.url, thumbUrl: info.thumburl ?? null, width: info.width, height: info.height,
              tags: [], description: stripHtml(md.ImageDescription?.value) || null, foundAt: today(), decision: null,
            });
            added++;
          }
          file.searched[wkey] = today();
        } catch (e) {
          console.error(`wikimedia "${q}": ${(e as Error).message}`);
        }
        await sleep(500);
      }
      saveCandidates(file);
      process.stderr.write(`\r${cat}: "${q}" · ${added} candidates `);
    }
  }
  process.stderr.write("\n");
  console.log(`${added} new illustrative candidate(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
