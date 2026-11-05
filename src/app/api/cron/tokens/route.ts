import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto";
import { refreshExpiringTokens } from "@/server/scheduler";

/** Manual trigger for the token refresh check (the in-process scheduler runs it every 6 hours). */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || !safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return new NextResponse(null, { status: 401 });
  return NextResponse.json({ ok: true, ...(await refreshExpiringTokens()) });
}
