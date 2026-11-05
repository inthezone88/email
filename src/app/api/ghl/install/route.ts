import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { randomId } from "@/server/crypto";
import { authorizeUrl } from "@/server/ghl/client";

/** Step 1 of the OAuth install: send the user to GHL's sub-account chooser. */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  const state = randomId(24);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("ghl_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/ghl", maxAge: 600 });
  return res;
}
