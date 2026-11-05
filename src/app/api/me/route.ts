import { NextResponse } from "next/server";
import { accessibleLocations, requireCtx } from "@/server/auth";
import { handle } from "@/server/http";

export const GET = handle(async () => {
  const ctx = await requireCtx({ allowNoLocation: true });
  const { locations } = await accessibleLocations(ctx.session);
  return NextResponse.json({
    email: ctx.session.email,
    isAdmin: ctx.isAdmin,
    currentLocationId: ctx.locationId || null,
    locations: locations.map((l) => ({ id: l.id, name: l.name, status: l.status, lastSyncedAt: l.lastSyncedAt, syncError: l.lastSyncError })),
  });
});
