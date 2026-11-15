import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-IP rate limiting for /api/place-photo (every call costs a billable Google Places request).
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (the Vercel
 * Upstash/KV integration's KV_REST_API_URL + KV_REST_API_TOKEN also work). Without them it's a no-op,
 * so local development needs nothing. If Redis is unreachable it fails open rather than breaking photos.
 *
 * Limits (per IP, overridable with env vars):
 *   PLACE_PHOTO_LIMIT_PER_MINUTE  default 120  (each photo is 2 calls: lookup + image)
 *   PLACE_PHOTO_LIMIT_PER_DAY     default 2000
 */
export interface RateLimiter {
  limit(id: string): Promise<{ success: boolean; reset: number }>;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

let cached: RateLimiter[] | null = null;
let warned = false;

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getPhotoLimiters(): RateLimiter[] {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (!warned && process.env.VERCEL_ENV === "production") {
      warned = true;
      console.warn("[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set: /api/place-photo is NOT rate limited.");
    }
    cached = [];
    return cached;
  }
  const redis = new Redis({ url, token });
  cached = [
    new Ratelimit({
      redis,
      prefix: "tcg:place-photo:min",
      limiter: Ratelimit.slidingWindow(envNumber("PLACE_PHOTO_LIMIT_PER_MINUTE", 120), "1 m"),
      timeout: 1000, // fail open if Redis is slow
    }),
    new Ratelimit({
      redis,
      prefix: "tcg:place-photo:day",
      limiter: Ratelimit.fixedWindow(envNumber("PLACE_PHOTO_LIMIT_PER_DAY", 2000), "1 d"),
      timeout: 1000,
    }),
  ];
  return cached;
}

/** Client IP as seen by Vercel (x-forwarded-for is set by Vercel's edge; first entry is the client). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit(id: string, limiters: RateLimiter[] = getPhotoLimiters()): Promise<RateLimitResult> {
  for (const l of limiters) {
    try {
      const r = await l.limit(id);
      if (!r.success) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
    } catch (err) {
      console.warn("[rate-limit] limiter error, allowing request:", err);
    }
  }
  return { ok: true };
}

/** Snap requested widths to a few fixed sizes so callers can't vary them endlessly. */
export const PHOTO_WIDTHS = [400, 800, 1200] as const;
export function snapPhotoWidth(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 800;
  return PHOTO_WIDTHS.reduce((best, w) => (Math.abs(w - n) < Math.abs(best - n) ? w : best), PHOTO_WIDTHS[0]);
}
