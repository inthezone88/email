import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { adminEmails } from "@/server/auth";
import { randomId, sha256 } from "@/server/crypto";
import { sendEmail } from "@/server/notify";
import { clientIp, handle, rateLimit } from "@/server/http";

const Body = z.object({ email: z.string().email().max(200) });

/** Magic-link request. Always answers the same way so it can't be used to probe who has access. */
export const POST = handle(async (req: Request) => {
  if (!rateLimit("login:" + clientIp(req), 5, 15 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const known = adminEmails().includes(email) || !!(await db.query.users.findFirst({ where: eq(schema.users.email, email) }));
  if (known) {
    const token = randomId(32);
    await db.insert(schema.loginTokens).values({ tokenHash: sha256(token), email, expiresAt: new Date(Date.now() + 15 * 60_000) });
    const base = process.env.APP_URL ?? new URL(req.url).origin;
    await sendEmail(email, "Your sign-in link", `Sign in to Email → Revenue:\n\n${base}/api/auth/verify?token=${token}\n\nThe link works once and expires in 15 minutes.`);
  }
  return NextResponse.json({ ok: true });
});
