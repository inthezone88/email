import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeEqual } from "@/server/crypto";
import { syncLocation } from "@/server/ghl/sync";

export const maxDuration = 800;

/** Vercel Cron: nightly reconcile for every connected sub-account (also re-attributes and evaluates alerts). */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new NextResponse(null, { status: 401 });
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
  return NextResponse.json({ ok: true, results });
}
