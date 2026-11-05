import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./auth";

/** Wrap a route handler: maps HttpError to JSON, never leaks internals or PII in logs. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      console.error("[api] unhandled:", e instanceof Error ? e.message : "unknown error");
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export function rangeParam(url: URL, allowed = [7, 30, 60, 90], fallback = 90): number {
  const n = Number(url.searchParams.get("range"));
  return allowed.includes(n) ? n : fallback;
}

// ---- tiny in-memory rate limiter (per instance; good enough to blunt abuse of public endpoints) ----
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.n++;
  return b.n <= max;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
