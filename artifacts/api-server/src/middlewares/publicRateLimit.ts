import { lt, sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { apiRateLimitBucketsTable, db } from "@workspace/db";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  keyPrefix: string;
};

const cleanupIntervalMs = 10 * 60_000;
let lastCleanupAt = 0;

async function cleanupExpiredBuckets(now: Date, windowMs: number) {
  if (now.getTime() - lastCleanupAt < cleanupIntervalMs) return;
  lastCleanupAt = now.getTime();
  try {
    await db
      .delete(apiRateLimitBucketsTable)
      .where(
        lt(
          apiRateLimitBucketsTable.updatedAt,
          new Date(now.getTime() - Math.max(windowMs, cleanupIntervalMs)),
        ),
      );
  } catch (err) {
    lastCleanupAt = 0;
    throw err;
  }
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

  return async (req, res, next) => {
    const now = new Date();
    const clientAddress = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${clientAddress}`;
    const windowStartedBefore = new Date(now.getTime() - windowMs);

    try {
      const [bucket] = await db
        .insert(apiRateLimitBucketsTable)
        .values({
          key,
          windowStartedAt: now,
          count: 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: apiRateLimitBucketsTable.key,
          set: {
            windowStartedAt: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} <= ${windowStartedBefore} THEN ${now} ELSE ${apiRateLimitBucketsTable.windowStartedAt} END`,
            count: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} <= ${windowStartedBefore} THEN 1 ELSE ${apiRateLimitBucketsTable.count} + 1 END`,
            updatedAt: now,
          },
        })
        .returning();

      if (!bucket) {
        throw new Error("Rate limit bucket was not returned.");
      }

      void cleanupExpiredBuckets(now, windowMs).catch((err) => {
        req.log.warn({ err }, "Failed to clean expired API rate limit buckets");
      });

      const resetAt = bucket.windowStartedAt.getTime() + windowMs;
      const remaining = Math.max(0, limit - bucket.count);
      const resetSeconds = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
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
    } catch (err) {
      req.log.error({ err }, "Distributed API rate limiter failed");
      res.status(503).json({
        error: "Perlindungan traffic sedang tidak tersedia. Coba lagi sebentar.",
      });
    }
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