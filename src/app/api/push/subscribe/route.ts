import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { HttpError, getSession } from "@/server/auth";
import { handle } from "@/server/http";

const Body = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

export const POST = handle(async (req: Request) => {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  const b = Body.parse(await req.json());
  await db
    .insert(schema.pushSubscriptions)
    .values({ endpoint: b.endpoint, userId: s.userId, p256dh: b.keys.p256dh, auth: b.keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: s.userId, p256dh: b.keys.p256dh, auth: b.keys.auth } });
  return NextResponse.json({ ok: true });
});
