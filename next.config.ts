import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Vercel's preview toolbar (vercel.live) only runs on preview deployments.
const isVercelPreview = process.env.VERCEL_ENV === "preview";

/**
 * Content-Security-Policy listing only what the site actually loads:
 * - Next.js inline bootstrap scripts ('unsafe-inline': pages are statically generated, so no per-request nonce)
 * - Google Maps JavaScript API on /map, loaded by @googlemaps/js-api-loader (scripts from maps.googleapis.com /
 *   *.googleapis.com / *.gstatic.com, Roboto from fonts.googleapis.com + fonts.gstatic.com, vector tiles and
 *   icons from *.googleapis.com / *.gstatic.com / *.google.com / *.ggpht.com, data:/blob: images and fetches,
 *   blob: workers for Advanced Markers / vector rendering)
 * - Leaflet + OpenStreetMap tiles on /map when no Google browser key is set
 * - Cafe photos are our own optimised copies under /images (same origin, via /_next/image), so img-src needs no
 *   Flickr/Wikimedia hosts; the Google hosts in img-src are for Maps JS tiles and icons only.
 */
const csp = [
  ["default-src", "'self'"],
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    ...(isVercelPreview ? ["https://vercel.live"] : []),
  ],
  ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://*.tile.openstreetmap.org",
    "https://maps.googleapis.com",
    "https://*.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://*.ggpht.com",
    "https://*.googleusercontent.com",
    ...(isVercelPreview ? ["https://vercel.live", "https://vercel.com"] : []),
  ],
  ["font-src", "'self'", "data:", "https://fonts.gstatic.com", ...(isVercelPreview ? ["https://vercel.live"] : [])],
  [
    "connect-src",
    "'self'",
    "https://maps.googleapis.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "data:",
    "blob:",
    ...(isDev ? ["ws:", "wss:"] : []),
    ...(isVercelPreview ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : []),
  ],
  ["worker-src", "'self'", "blob:"],
  ["frame-src", ...(isVercelPreview ? ["https://vercel.live"] : ["'none'"])],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
  ...(isDev ? [] : [["upgrade-insecure-requests"]]),
]
  .map((d) => d.join(" "))
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Cafe photos: next/image serves AVIF/WebP at the sizes each layout asks for and the CDN keeps them for a year.
  // Files under /images carry a content hash in their name (see scripts/images/approve.ts), so they can be immutable.
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 1080, 1600],
    imageSizes: [384],
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  // Old cafe URLs that changed when a listing was corrected. Permanent (308) so links and search results follow.
  async redirects() {
    return [
      { source: "/cafes/de-mello-coffee-yorkville", destination: "/cafes/de-mello-coffee-bloor-east", permanent: true },
      // Short form from the brief (/cafe/neo-coffee-bar) → the canonical /cafes/<slug>.
      { source: "/cafe/:slug", destination: "/cafes/:slug", permanent: true },
      { source: "/neighbourhood/:slug", destination: "/neighbourhoods/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
