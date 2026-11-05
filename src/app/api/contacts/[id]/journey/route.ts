import { NextResponse } from "next/server";
import { HttpError, requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { contactJourney } from "@/server/reports";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCtx();
  const { id } = await params;
  const j = await contactJourney(ctx.locationId, id);
  if (!j) throw new HttpError(404, "Contact not found");
  return NextResponse.json({ data: j }, { headers: { "Cache-Control": "private, no-store" } });
});
