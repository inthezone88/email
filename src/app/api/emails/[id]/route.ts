import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireCtx } from "@/server/auth";
import { handle } from "@/server/http";

const Body = z.object({
  subjectStyleOverride: z.enum(["Question", "Number", "Urgency", "Plain"]).nullable().optional(),
  utmCampaign: z.string().regex(/^[a-z0-9-_]{1,80}$/).optional(),
  name: z.string().min(1).max(200).optional(),
});

/** Manual overrides: subject style, UTM slug, display name. */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCtx();
  const { id } = await params;
  const b = Body.parse(await req.json());
  await db
    .update(schema.emails)
    .set({ ...b, needsReview: false })
    .where(and(eq(schema.emails.locationId, ctx.locationId), eq(schema.emails.id, id)));
  return NextResponse.json({ ok: true });
});
