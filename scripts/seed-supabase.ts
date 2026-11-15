/**
 * Upsert data/cafes.seed.json into the Supabase `cafes` table (matched on slug).
 *   npm run db:seed
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import seed from "../data/cafes.seed.json";
import { normalizeCafe } from "../src/lib/normalize-cafe";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = (seed as Record<string, unknown>[]).map((raw) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, ...rest } = normalizeCafe(raw);
    return rest; // let Postgres generate id/timestamps
  });

  const slugs = new Set<string>();
  for (const r of rows) {
    if (slugs.has(r.slug)) throw new Error(`Duplicate slug: ${r.slug}`);
    slugs.add(r.slug);
  }

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await db.from("cafes").upsert(batch, { onConflict: "slug" });
    if (error) throw error;
    console.log(`Upserted ${Math.min(i + 100, rows.length)}/${rows.length}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
