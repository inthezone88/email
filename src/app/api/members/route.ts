import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, requireCtx } from "@/server/auth";
import { handle } from "@/server/http";
import { randomId } from "@/server/crypto";

/** Give a client (or teammate) read access to the current sub-account. Admin only. */
export const GET = handle(async () => {
  const ctx = await requireCtx();
  const rows = await db
    .select({ email: schema.users.email, role: schema.userLocations.role })
    .from(schema.userLocations)
    .innerJoin(schema.users, eq(schema.users.id, schema.userLocations.userId))
    .where(eq(schema.userLocations.locationId, ctx.locationId));
  return NextResponse.json({ data: rows });
});

export const POST = handle(async (req: Request) => {
  const ctx = await requireCtx();
  if (!ctx.isAdmin) throw new HttpError(403, "Only admins can add people");
  const { email } = z.object({ email: z.string().email() }).parse(await req.json());
  const e = email.toLowerCase();
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, e) });
  if (!user) [user] = await db.insert(schema.users).values({ id: "u_" + randomId(12), email: e }).returning();
  await db.insert(schema.userLocations).values({ userId: user.id, locationId: ctx.locationId, role: "viewer" }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
});
