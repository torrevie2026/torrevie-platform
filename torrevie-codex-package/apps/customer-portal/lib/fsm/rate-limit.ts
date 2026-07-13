export type FsmRateLimitPolicy = {
  key: "fsm.portal.intake" | "fsm.voice.webhook";
  windowMs: number;
  maxRequests: number;
};

export type FsmRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export const fsmRateLimitPolicies: Record<FsmRateLimitPolicy["key"], FsmRateLimitPolicy> = {
  "fsm.portal.intake": {
    key: "fsm.portal.intake",
    windowMs: 60_000,
    maxRequests: 20
  },
  "fsm.voice.webhook": {
    key: "fsm.voice.webhook",
    windowMs: 60_000,
    maxRequests: 120
  }
};

type Bucket = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(policy: FsmRateLimitPolicy, identity: string, now = Date.now()): FsmRateLimitResult {
    const key = `${policy.key}:${identity}`;
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + policy.windowMs } : existing;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const remaining = Math.max(policy.maxRequests - bucket.count, 0);

    return {
      allowed: bucket.count <= policy.maxRequests,
      remaining,
      resetAt: bucket.resetAt
    };
  }

  reset() {
    this.buckets.clear();
  }
}

export function rateLimitHeaders(result: FsmRateLimitResult) {
  return {
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": new Date(result.resetAt).toISOString()
  };
}
