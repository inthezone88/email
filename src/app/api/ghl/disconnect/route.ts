import { NextResponse } from "next/server";
import { requireCtx } from "@/server/auth";
import { disconnect } from "@/server/ghl/client";
import { handle } from "@/server/http";

export const POST = handle(async () => {
  const ctx = await requireCtx();
  await disconnect(ctx.locationId);
  return NextResponse.json({ ok: true });
});
