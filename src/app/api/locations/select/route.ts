import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLocation, getSession, HttpError, LOCATION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { handle } from "@/server/http";

export const POST = handle(async (req: Request) => {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
  if (!(await canAccessLocation(s, id))) throw new HttpError(403, "No access to that sub-account");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCATION_COOKIE, id, { ...sessionCookieOptions, httpOnly: false });
  return res;
});
