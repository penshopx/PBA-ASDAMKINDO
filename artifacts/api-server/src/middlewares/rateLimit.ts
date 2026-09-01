import { getAuth } from "@clerk/express";
import { count, eq, lt, sql } from "drizzle-orm";
import type { Request, RequestHandler, Response } from "express";
import { isIP } from "node:net";
import { apiRateLimitBucketsTable, db } from "@workspace/db";

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_BUCKETS = 10_000;
const MAX_TRUSTED_PROXY_HOPS = 5;
const MAX_FORWARDED_FOR_ENTRIES = 5;
const MAX_CONFIGURED_BUCKETS = 100_000;
const CLEANUP_INTERVAL_MS = 10 * 60_000;

export type RateLimitPolicyName =
  | "ingress"
  | "health"
  | "public-read"
  | "auth-sensitive"
  | "write";

export interface RateLimitPolicy {
  name: RateLimitPolicyName;
  max: number;
  windowMs: number;
}

export interface RateLimitPolicies {
  ingress: RateLimitPolicy;
  health: RateLimitPolicy;
  publicRead: RateLimitPolicy;
  authSensitive: RateLimitPolicy;
  write: RateLimitPolicy;
}

export interface ClientIdentity {
  key: string;
  kind: "user" | "ip";
}

interface DistributedBucket {
  count: number;
  windowStartedAt: Date;
}

export type RateLimitStoreFailureMode = "open" | "closed";
export type RateLimitStoreConsumer = (
  key: string,
  policy: RateLimitPolicy,
  now: Date,
) => Promise<DistributedBucket>;

let lastCleanupAt = 0;

function positiveIntegerFromEnv(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

function nonNegativeIntegerFromEnv(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isInteger(value) || value < 0) return fallback;
  return Math.min(value, maximum);
}

const windowMs =
  positiveIntegerFromEnv("RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS, 3_600) *
  1_000;

export const rateLimitPolicies: RateLimitPolicies = {
  ingress: {
    name: "ingress",
    max: positiveIntegerFromEnv("RATE_LIMIT_INGRESS_MAX", 300, 1_000),
    windowMs,
  },
  health: {
    name: "health",
    max: positiveIntegerFromEnv("RATE_LIMIT_HEALTH_MAX", 120, 1_000),
    windowMs,
  },
  publicRead: {
    name: "public-read",
    max: positiveIntegerFromEnv("RATE_LIMIT_PUBLIC_READ_MAX", 60, 1_000),
    windowMs,
  },
  authSensitive: {
    name: "auth-sensitive",
    max: positiveIntegerFromEnv("RATE_LIMIT_AUTH_MAX", 30, 1_000),
    windowMs,
  },
  write: {
    name: "write",
    max: positiveIntegerFromEnv("RATE_LIMIT_WRITE_MAX", 20, 1_000),
    windowMs,
  },
};

/**
 * Only trust forwarded addresses when the deployment has explicitly declared
 * how many proxy hops it owns. The default is one hop for the Replit edge;
 * set this to 0 when the server is directly reachable.
 */
export function getRateLimitTrustedProxyHops(): number {
  return nonNegativeIntegerFromEnv(
    "RATE_LIMIT_TRUSTED_PROXY_HOPS",
    1,
    MAX_TRUSTED_PROXY_HOPS,
  );
}

export function getRateLimitStoreFailureMode(): RateLimitStoreFailureMode {
  return process.env.RATE_LIMIT_FAILURE_MODE === "open" ? "open" : "closed";
}

export function getRateLimitMaxBuckets(): number {
  return positiveIntegerFromEnv(
    "RATE_LIMIT_MAX_BUCKETS",
    DEFAULT_MAX_BUCKETS,
    MAX_CONFIGURED_BUCKETS,
  );
}

function forwardedAddresses(req: Request): string[] {
  const raw = req.headers["x-forwarded-for"];
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  if (!value) return [];

  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .slice(-MAX_FORWARDED_FOR_ENTRIES);
}

/**
 * Select the address immediately behind the configured trusted proxy chain.
 * Taking a bounded, right-sided entry prevents an attacker from creating an
 * unbounded number of identities by sending arbitrarily long X-Forwarded-For
 * headers. The deployment must set the hop count to match its actual proxy.
 */
export function getRateLimitClientAddress(req: Request): string {
  const remoteAddress = req.socket.remoteAddress?.trim() || "unknown";
  const trustedHops = getRateLimitTrustedProxyHops();
  if (trustedHops === 0) return remoteAddress;

  const forwarded = forwardedAddresses(req);
  if (forwarded.length === 0) return remoteAddress;

  const candidateIndex = Math.max(0, forwarded.length - trustedHops);
  const candidate = forwarded[candidateIndex];
  return candidate && isIP(candidate) ? candidate : remoteAddress;
}

export function getClientIdentity(req: Request): ClientIdentity {
  try {
    const userId = getAuth(req).userId;
    if (userId) return { key: `user:${userId.slice(0, 128)}`, kind: "user" };
  } catch {
    // Requests in isolated router tests may not have Clerk middleware.
  }

  return { key: `ip:${getRateLimitClientAddress(req)}`, kind: "ip" };
}

function requestPath(req: Request): string {
  const path = req.path || req.url.split("?")[0];
  return `${req.baseUrl || ""}${path}` || "/";
}

export function getRateLimitPolicy(req: Request): RateLimitPolicy {
  const path = requestPath(req);
  if (req.method === "GET" && path === "/api/healthz") {
    return rateLimitPolicies.health;
  }
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    (path === "/api/programs" || /^\/api\/passport\/[^/]+$/.test(path))
  ) {
    return rateLimitPolicies.publicRead;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return rateLimitPolicies.write;
  }
  return rateLimitPolicies.authSensitive;
}

async function cleanupExpiredBuckets(now: Date, windowMs: number): Promise<void> {
  if (now.getTime() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now.getTime();
  try {
    await db
      .delete(apiRateLimitBucketsTable)
      .where(
        lt(
          apiRateLimitBucketsTable.updatedAt,
          new Date(now.getTime() - Math.max(windowMs, CLEANUP_INTERVAL_MS)),
        ),
      );
  } catch (err) {
    lastCleanupAt = 0;
    throw err;
  }
}

async function consumeDistributedBucket(
  key: string,
  policy: RateLimitPolicy,
  now: Date,
): Promise<DistributedBucket> {
  const windowStartedBefore = new Date(now.getTime() - policy.windowMs);
  const update = {
    windowStartedAt: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} <= ${windowStartedBefore} THEN ${now} ELSE ${apiRateLimitBucketsTable.windowStartedAt} END`,
    count: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} <= ${windowStartedBefore} THEN 1 ELSE ${apiRateLimitBucketsTable.count} + 1 END`,
    updatedAt: now,
  };

  const [updated] = await db
    .update(apiRateLimitBucketsTable)
    .set(update)
    .where(eq(apiRateLimitBucketsTable.key, key))
    .returning({
      count: apiRateLimitBucketsTable.count,
      windowStartedAt: apiRateLimitBucketsTable.windowStartedAt,
    });
  if (updated) return updated;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1947166501)`);
    await tx
      .delete(apiRateLimitBucketsTable)
      .where(
        lt(
          apiRateLimitBucketsTable.updatedAt,
          new Date(
            now.getTime() - Math.max(policy.windowMs, CLEANUP_INTERVAL_MS),
          ),
        ),
      );

    const [createdByAnotherInstance] = await tx
      .update(apiRateLimitBucketsTable)
      .set(update)
      .where(eq(apiRateLimitBucketsTable.key, key))
      .returning({
        count: apiRateLimitBucketsTable.count,
        windowStartedAt: apiRateLimitBucketsTable.windowStartedAt,
      });
    if (createdByAnotherInstance) return createdByAnotherInstance;

    const [capacity] = await tx
      .select({ value: count() })
      .from(apiRateLimitBucketsTable);
    if ((capacity?.value ?? 0) >= getRateLimitMaxBuckets()) {
      throw new Error("Rate limit bucket capacity exhausted.");
    }

    const [created] = await tx
      .insert(apiRateLimitBucketsTable)
      .values({
        key,
        windowStartedAt: now,
        count: 1,
        updatedAt: now,
      })
      .returning({
        count: apiRateLimitBucketsTable.count,
        windowStartedAt: apiRateLimitBucketsTable.windowStartedAt,
      });
    if (!created) {
      throw new Error("Rate limit bucket was not returned.");
    }
    return created;
  });
}

function setRateLimitHeaders(
  res: Response,
  policy: RateLimitPolicy,
  remaining: number,
  resetAfterSeconds: number,
): void {
  res.setHeader("RateLimit-Limit", String(policy.max));
  res.setHeader("RateLimit-Remaining", String(Math.max(remaining, 0)));
  res.setHeader("RateLimit-Reset", String(Math.max(resetAfterSeconds, 0)));
}

export function createRateLimitMiddleware(
  policyForRequest: (req: Request) => RateLimitPolicy,
  identityForRequest: (req: Request) => ClientIdentity,
  consume: RateLimitStoreConsumer = consumeDistributedBucket,
): RequestHandler {
  return (req, res, next) => {
    const policy = policyForRequest(req);
    void enforceRateLimit(
      policy,
      identityForRequest(req),
      req,
      res,
      next,
      consume,
    );
  };
}

export const rateLimitMiddleware = createRateLimitMiddleware(
  getRateLimitPolicy,
  getClientIdentity,
);

export const ingressRateLimitMiddleware = createRateLimitMiddleware(
  () => rateLimitPolicies.ingress,
  (req) => ({
    key: `ip:${getRateLimitClientAddress(req)}`,
    kind: "ip",
  }),
);

async function enforceRateLimit(
  policy: RateLimitPolicy,
  identity: ClientIdentity,
  req: Request,
  res: Response,
  next: Parameters<RequestHandler>[2],
  consume: RateLimitStoreConsumer,
): Promise<void> {
  const now = new Date();
  const key = `${policy.name}:${identity.key}`;

  try {
    const bucket = await consume(key, policy, now);

    void cleanupExpiredBuckets(now, policy.windowMs).catch((err) => {
      req.log.warn({ err }, "Failed to clean expired API rate limit buckets");
    });

    const resetAt = bucket.windowStartedAt.getTime() + policy.windowMs;
    const resetAfterSeconds = Math.max(
      1,
      Math.ceil((resetAt - now.getTime()) / 1_000),
    );
    const remaining = Math.max(0, policy.max - bucket.count);
    setRateLimitHeaders(res, policy, remaining, resetAfterSeconds);

    if (bucket.count > policy.max) {
      res.setHeader("Retry-After", String(resetAfterSeconds));
      req.log.warn(
        {
          rateLimitPolicy: policy.name,
          rateLimitIdentity: identity.kind,
          rateLimitStore: "postgres",
        },
        "Rate limit exceeded",
      );
      res.status(429).json({
        error: "Terlalu banyak permintaan. Coba lagi nanti.",
        code: "RATE_LIMITED",
        retryAfterSeconds: resetAfterSeconds,
      });
      return;
    }

    next();
  } catch (err) {
    const failureMode = getRateLimitStoreFailureMode();
    req.log.error(
      {
        err,
        rateLimitPolicy: policy.name,
        rateLimitStore: "postgres",
        rateLimitFailureMode: failureMode,
      },
      "Distributed API rate limiter failed",
    );
    if (failureMode === "open") {
      req.log.warn(
        { rateLimitPolicy: policy.name },
        "Rate limiter fail-open allowed request",
      );
      next();
      return;
    }

    res.status(503).json({
      error: "Perlindungan traffic sedang tidak tersedia. Coba lagi sebentar.",
    });
  }
}

export function resetRateLimitStoreForTests(): void {
  lastCleanupAt = 0;
}