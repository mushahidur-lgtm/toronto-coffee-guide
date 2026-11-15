/**
 * Absolute site URL for canonical links, the sitemap, robots.txt, Open Graph and JSON-LD.
 * 1. NEXT_PUBLIC_SITE_URL (set this in Vercel, especially with a custom domain)
 * 2. Vercel's production domain (VERCEL_PROJECT_PRODUCTION_URL, set automatically on Vercel)
 * 3. http://localhost:3000 for local development
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE = {
  name: "Toronto Coffee Guide",
  tagline: "Discover Toronto's Coffee Scene.",
  description:
    "Find your next favourite coffee shop. Explore independent cafes, specialty coffee, matcha bars, and hidden gems across Toronto.",
  url: resolveSiteUrl().replace(/\/$/, ""),
};

export const QUICK_SEARCHES = [
  "Matcha",
  "Vietnamese Coffee",
  "Specialty Coffee",
  "Japanese Cafes",
  "Bakeries",
  "Cold Brew",
  "Brunch",
  "Pastries",
];
