import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { nightlyReconcile } from "@/server/scheduler";

export const maxDuration = 800;

/**
 * Manual trigger for the nightly reconcile (the in-process scheduler runs it automatically).
 * curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/nightly
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new NextResponse(null, { status: 401 });
  return NextResponse.json({ ok: true, results: await nightlyReconcile() });
}
