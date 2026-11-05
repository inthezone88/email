import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { accessToken } from "./ghl/client";
import { syncLocation } from "./ghl/sync";

const HOUR = 3_600_000;

export async function refreshExpiringTokens() {
  const soon = new Date(Date.now() + 8 * HOUR);
  const locs = await db
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(and(eq(schema.locations.status, "connected"), lt(schema.locations.tokenExpiresAt, soon)));
  let refreshed = 0;
  for (const l of locs) {
    try {
      await accessToken(l.id, true);
      refreshed++;
    } catch {
      /* status is set to "error" inside accessToken; Settings shows "Reconnect" */
    }
  }
  return { checked: locs.length, refreshed };
}

export async function nightlyReconcile() {
  const locs = await db.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.status, "connected"));
  const results: Record<string, string> = {};
  for (const l of locs) {
    try {
      await syncLocation(l.id, "reconcile");
      results[l.id] = "ok";
    } catch (e) {
      results[l.id] = e instanceof Error ? e.message : "failed";
    }
  }
  return results;
}

/** Milliseconds until the next HH:MM UTC. */
export function msUntilUtc(hour: number, minute: number, now = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

let started = false;
let running = false;

async function guarded(name: string, fn: () => Promise<unknown>) {
  if (running) return; // never overlap jobs
  running = true;
  try {
    const r = await fn();
    console.info(`[cron] ${name} done`, JSON.stringify(r));
  } catch (e) {
    console.error(`[cron] ${name} failed:`, e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  // Token check shortly after boot, then every 6 hours.
  setTimeout(() => guarded("tokens", refreshExpiringTokens), 60_000);
  setInterval(() => guarded("tokens", refreshExpiringTokens), 6 * HOUR).unref();
  // Nightly reconcile at 07:17 UTC.
  const scheduleNightly = () => {
    setTimeout(async () => {
      await guarded("nightly", nightlyReconcile);
      scheduleNightly();
    }, msUntilUtc(7, 17)).unref();
  };
  scheduleNightly();
  console.info("[cron] scheduler started (tokens every 6h, reconcile 07:17 UTC)");
}
