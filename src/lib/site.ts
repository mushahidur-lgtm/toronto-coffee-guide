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
  tagline: "Find Your Next Favourite Cafe in Toronto.",
  description: "Discover independent coffee shops, specialty matcha bars, hidden gems and neighbourhood favourites.",
  url: resolveSiteUrl().replace(/\/$/, ""),
};

export const QUICK_SEARCHES = ["Matcha", "Vietnamese Coffee", "Specialty Coffee", "Japanese Cafes", "Croissants", "Work-Friendly Cafes"];
