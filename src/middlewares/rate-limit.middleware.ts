import type { RequestHandler } from "express";

import { TooManyRequestsError } from "../shared/errors/app-error.js";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  return (request, _response, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = [
      options.keyPrefix ?? "global",
      request.ip,
      request.auth?.tenantId ?? "anonymous",
      request.auth?.userId ?? "anonymous"
    ].join(":");
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.maxRequests) {
      throw new TooManyRequestsError();
    }

    next();
  };
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 10_000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
