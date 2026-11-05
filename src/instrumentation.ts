/**
 * Runs once when the Next.js server boots. On Railway (a long-running server, not serverless)
 * we schedule the background jobs in-process instead of using an external cron:
 *  - token refresh check every 6 hours
 *  - nightly GHL reconcile + re-attribution + alerts at 07:17 UTC
 * Set DISABLE_CRON=true to turn this off (e.g. on a PR preview, or if you run more than one replica).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_CRON === "true" || process.env.NODE_ENV !== "production") return;
  const { startScheduler } = await import("./server/scheduler");
  startScheduler();
}
