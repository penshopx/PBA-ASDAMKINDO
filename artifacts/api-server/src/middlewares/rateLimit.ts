import { getAuth } from "@clerk/express";
import type { Request, RequestHandler, Response } from "express";
import { isIP } from "node:net";

const DEFAULT_WINDOW_SECONDS = 60;
const MAX_TRUSTED_PROXY_HOPS = 5;
const MAX_FORWARDED_FOR_ENTRIES = 5;
const MAX_BUCKETS = 10_000;

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

interface Bucket {
  count: number;
  resetAt: number;
}

interface ClientIdentity {
  key: string;
  kind: "user" | "ip";
}

const buckets = new Map<string, Bucket>();

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

function getClientIdentity(req: Request): ClientIdentity {
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

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function makeBucketCapacity(now: number, window: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  pruneExpiredBuckets(now);
  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) return;
    buckets.delete(oldestKey);
  }
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

export const rateLimitMiddleware: RequestHandler = (req, res, next) => {
  const policy = getRateLimitPolicy(req);
  enforceRateLimit(policy, getClientIdentity(req), req, res, next);
};

export const ingressRateLimitMiddleware: RequestHandler = (req, res, next) => {
  enforceRateLimit(
    rateLimitPolicies.ingress,
    { key: `ip:${getRateLimitClientAddress(req)}`, kind: "ip" },
    req,
    res,
    next,
  );
};

function enforceRateLimit(
  policy: RateLimitPolicy,
  identity: ClientIdentity,
  req: Request,
  res: Response,
  next: Parameters<RequestHandler>[2],
): void {
  const now = Date.now();
  const key = `${policy.name}:${identity.key}`;
  const existingBucket = buckets.get(key);
  if (!existingBucket) makeBucketCapacity(now, policy.windowMs);
  const bucket =
    !existingBucket || existingBucket.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : existingBucket;

  const resetAfterSeconds =
    Math.ceil((bucket.resetAt - now) / 1_000);
  if (bucket.count >= policy.max) {
    setRateLimitHeaders(res, policy, 0, resetAfterSeconds);
    res.setHeader("Retry-After", String(Math.max(resetAfterSeconds, 1)));
    req.log.warn(
      { rateLimitPolicy: policy.name, rateLimitIdentity: identity.kind },
      "Rate limit exceeded",
    );
    res.status(429).json({
      error: "Terlalu banyak permintaan. Coba lagi nanti.",
      code: "RATE_LIMITED",
      retryAfterSeconds: Math.max(resetAfterSeconds, 1),
    });
    return;
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  setRateLimitHeaders(
    res,
    policy,
    policy.max - bucket.count,
    resetAfterSeconds,
  );
  next();
}

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}