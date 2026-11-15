import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Vercel's preview toolbar (vercel.live) only runs on preview deployments.
const isVercelPreview = process.env.VERCEL_ENV === "preview";

/**
 * Content-Security-Policy listing only what the site actually loads:
 * - Next.js inline bootstrap scripts ('unsafe-inline': pages are statically generated, so no per-request nonce)
 * - Google Maps JavaScript API on /map (maps.googleapis.com / maps.gstatic.com, Roboto from Google Fonts,
 *   map tiles and icons from *.googleapis.com / *.gstatic.com / *.google.com / *.ggpht.com, workers from blob:)
 * - Leaflet + OpenStreetMap tiles on /map when no Google browser key is set
 * - Cafe photos come from our own /api/place-photo (same origin); Google photo hosts are listed for Maps JS.
 * Editorial image_url values on other hosts must be added to img-src (or put in /public).
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Old cafe URLs that changed when a listing was corrected. Permanent (308) so links and search results follow.
  async redirects() {
    return [
      { source: "/cafes/de-mello-coffee-yorkville", destination: "/cafes/de-mello-coffee-bloor-east", permanent: true },
    ];
  },
};

export default nextConfig;
