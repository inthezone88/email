import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { randomId } from "@/server/crypto";
import { linkAudit } from "@/server/queries";
import { buildTaggedUrl } from "@/lib/utm";

/** Link tagger: list sends (for the picker), tracked links, and the audit of sends missing UTMs. */
export const GET = handle(async () => {
  const ctx = await requireCtx();
  const emails = await db
    .select({ id: schema.emails.id, name: schema.emails.name, subject: schema.emails.subject, utmCampaign: schema.emails.utmCampaign, sentAt: schema.emails.sentAt, style: schema.emails.subjectStyle, styleOverride: schema.emails.subjectStyleOverride })
    .from(schema.emails)
    .where(eq(schema.emails.locationId, ctx.locationId))
    .orderBy(desc(schema.emails.sentAt))
    .limit(200);
  const links = await db.select().from(schema.trackedLinks).where(eq(schema.trackedLinks.locationId, ctx.locationId)).orderBy(desc(schema.trackedLinks.createdAt)).limit(100);
  return NextResponse.json({ data: { emails, links, audit: await linkAudit(ctx.locationId) } });
});

const Body = z.object({ emailId: z.string().min(1), destination: z.string().url().max(2000), label: z.string().max(100).optional() });

export const POST = handle(async (req: Request) => {
  const ctx = await requireCtx();
  const b = Body.parse(await req.json());
  const email = await db.query.emails.findFirst({ where: and(eq(schema.emails.locationId, ctx.locationId), eq(schema.emails.id, b.emailId)) });
  if (!email) throw new HttpError(404, "Email not found");
  const tagged = buildTaggedUrl(b.destination, { campaign: email.utmCampaign ?? email.id, content: email.id });
  const id = randomId(8);
  await db.insert(schema.trackedLinks).values({ id, locationId: ctx.locationId, emailId: email.id, destination: tagged, label: b.label ?? null });
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({ data: { id, tagged, tracked: `${base}/r/${id}?c={{contact.id}}` } });
});
