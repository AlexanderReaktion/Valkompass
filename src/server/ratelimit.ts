/**
 * Enkel in-memory fixed-window rate limiter (baslinje + budget-skydd).
 * Klocka injiceras (nowMs) för testbarhet. I produktion: flytta till Edge
 * Middleware med Upstash (se ARCHITECTURE.md), plus global daglig budget-killswitch.
 */

export interface RateLimiter {
  /** true = tillåten, false = över gränsen. */
  check(key: string, nowMs: number): boolean;
}

export function fixedWindowLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; reset: number }>();
  return {
    check(key: string, nowMs: number): boolean {
      const e = hits.get(key);
      if (!e || nowMs >= e.reset) {
        hits.set(key, { count: 1, reset: nowMs + windowMs });
        return true;
      }
      if (e.count >= limit) return false;
      e.count += 1;
      return true;
    },
  };
}
