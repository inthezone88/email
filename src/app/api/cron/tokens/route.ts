import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeEqual } from "@/server/crypto";
import { accessToken } from "@/server/ghl/client";

/** Vercel Cron: refresh any token expiring in the next 8 hours so a quiet account never lapses. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new NextResponse(null, { status: 401 });
  const soon = new Date(Date.now() + 8 * 3600_000);
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
      /* status set to error inside accessToken */
    }
  }
  return NextResponse.json({ ok: true, refreshed, checked: locs.length });
}
