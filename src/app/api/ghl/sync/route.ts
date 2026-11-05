import { NextResponse } from "next/server";
import { HttpError, requireCtx } from "@/server/auth";
import { syncLocation } from "@/server/ghl/sync";
import { rebuildAttributions } from "@/server/attribution";
import { runAlerts } from "@/server/alerts";
import { handle } from "@/server/http";

export const maxDuration = 300;

export const POST = handle(async () => {
  const ctx = await requireCtx();
  if (ctx.location.status === "demo") {
    await rebuildAttributions(ctx.locationId);
    await runAlerts(ctx.locationId);
    return NextResponse.json({ ok: true, demo: true });
  }
  if (ctx.location.status !== "connected") throw new HttpError(409, "Sub-account is not connected", "disconnected");
  const stats = await syncLocation(ctx.locationId, ctx.location.backfilledAt ? "reconcile" : "backfill");
  return NextResponse.json({ ok: true, stats });
});
