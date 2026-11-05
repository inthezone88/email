import { NextResponse, after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { getSettings, rebuildAttributions } from "@/server/attribution";
import { runAlerts } from "@/server/alerts";

export const maxDuration = 300;

export const GET = handle(async () => {
  const ctx = await requireCtx();
  return NextResponse.json({ data: await getSettings(ctx.locationId) });
});

const Body = z.object({ windowDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60)]).optional(), model: z.enum(["last_click", "first_click"]).optional() });

/** Persist attribution settings, then re-attribute in the background (dashboards show a spinner meanwhile). */
export const PUT = handle(async (req: Request) => {
  const ctx = await requireCtx();
  const b = Body.parse(await req.json());
  await getSettings(ctx.locationId); // ensure row
  await db
    .update(schema.settings)
    .set({ ...b, reattributing: true, updatedAt: sql`now()` })
    .where(eq(schema.settings.locationId, ctx.locationId));
  after(async () => {
    await rebuildAttributions(ctx.locationId);
    await runAlerts(ctx.locationId);
  });
  return NextResponse.json({ data: await getSettings(ctx.locationId) });
});
