import { NextResponse } from "next/server";
import { requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { contactList } from "@/server/queries";

/** Contacts sorted by revenue, with search (name, email or exact id). */
export const GET = handle(async (req: Request) => {
  const ctx = await requireCtx();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  return NextResponse.json({ data: await contactList(ctx.locationId, q) }, { headers: { "Cache-Control": "private, no-store" } });
});
