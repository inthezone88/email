import { NextResponse } from "next/server";
import { requireCtx } from "@/server/auth";
import { handle, rangeParam } from "@/server/http";
import * as reports from "@/server/reports";

export const GET = handle(async (req: Request) => {
  const ctx = await requireCtx();
  const range = rangeParam(new URL(req.url));
  const [data, meta] = await Promise.all([reports.overview(ctx.locationId, range), reports.meta(ctx.locationId)]);
  return NextResponse.json({ range, data, meta }, { headers: { "Cache-Control": "private, no-store" } });
});
