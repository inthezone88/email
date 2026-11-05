import { NextResponse } from "next/server";
import { requireCtx } from "@/server/auth";
import { handle, rangeParam } from "@/server/http";
import * as reports from "@/server/reports";

export const GET = handle(async (req: Request) => {
  const ctx = await requireCtx();
  const url = new URL(req.url);
  const range = rangeParam(url);
  const d = url.searchParams.get("dim");
  const dim = d === "source" || d === "sender" ? d : "list";
  const [data, meta] = await Promise.all([reports.segments(ctx.locationId, range, dim), reports.meta(ctx.locationId)]);
  return NextResponse.json({ range, dim, data, meta }, { headers: { "Cache-Control": "private, no-store" } });
});
