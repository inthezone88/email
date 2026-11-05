import { NextResponse } from "next/server";
import { HttpError, requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { deleteContactData } from "@/server/ingest";
import { rebuildAttributions } from "@/server/attribution";

/** Data-deletion path: removes a contact and every event, conversion and credit tied to them. */
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCtx();
  if (!ctx.isAdmin) throw new HttpError(403, "Only admins can delete contact data");
  const { id } = await params;
  await deleteContactData(ctx.locationId, id);
  await rebuildAttributions(ctx.locationId);
  return NextResponse.json({ ok: true });
});
