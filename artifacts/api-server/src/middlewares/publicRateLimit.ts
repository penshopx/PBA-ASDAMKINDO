import type { RequestHandler } from "express";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  keyPrefix: string;
};

type Bucket = {
  startedAt: number;
  count: number;
};

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;

function cleanupExpired(now: number, windowMs: number) {
  if (now - lastCleanupAt < windowMs) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= windowMs) buckets.delete(key);
  }
  lastCleanupAt = now;
}

export function createPublicRateLimit({
  limit,
  windowMs,
  keyPrefix,
}: RateLimitOptions): RequestHandler {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Rate limit must be a positive integer.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit window must be positive.");
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpired(now, windowMs);
    const clientAddress = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${clientAddress}`;
    const current = buckets.get(key);
    const bucket =
      !current || now - current.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : current;

    bucket.count += 1;
    buckets.set(key, bucket);

    const resetAt = bucket.startedAt + windowMs;
    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({
        error: "Terlalu banyak permintaan. Coba lagi setelah beberapa saat.",
      });
      return;
    }

    next();
  };
}

export const publicProgramsRateLimit = createPublicRateLimit({
  keyPrefix: "public-programs",
  limit: 60,
  windowMs: 60_000,
});

export const publicPassportRateLimit = createPublicRateLimit({
  keyPrefix: "public-passport",
  limit: 60,
  windowMs: 60_000,
});