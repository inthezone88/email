import { NextResponse } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminEmails, SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/auth";
import { randomId, sha256 } from "@/server/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(schema.loginTokens.tokenHash, sha256(token)), isNull(schema.loginTokens.usedAt), gt(schema.loginTokens.expiresAt, new Date())))
    .returning();
  if (!row) return NextResponse.redirect(new URL("/login?error=expired", url));
  const isAdmin = adminEmails().includes(row.email);
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, row.email) });
  if (!user) [user] = await db.insert(schema.users).values({ id: "u_" + randomId(12), email: row.email, isAdmin }).returning();
  else if (isAdmin && !user.isAdmin) await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, user.id));
  const res = NextResponse.redirect(new URL("/", url));
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, email: user.email }), sessionCookieOptions);
  return res;
}
