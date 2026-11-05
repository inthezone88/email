import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getSession, LOCATION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { safeEqual } from "@/server/crypto";
import { exchangeCode, saveInstall } from "@/server/ghl/client";
import { syncLocation } from "@/server/ghl/sync";

export const maxDuration = 300;

/** Step 2: GHL redirects back with ?code. Exchange it, store tokens encrypted, kick off the backfill. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", url));
  const jar = await cookies();
  const expected = jar.get("ghl_oauth_state")?.value;
  const state = url.searchParams.get("state");
  // GHL may not echo `state` for installs started from the marketplace; only enforce when we started it.
  if (expected && state && !safeEqual(expected, state)) return NextResponse.redirect(new URL("/settings?ghl=state_mismatch", url));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/settings?ghl=missing_code", url));
  try {
    const tokens = await exchangeCode(code);
    const locationId = await saveInstall(tokens, s.userId);
    after(async () => {
      try {
        await syncLocation(locationId, "backfill");
      } catch (e) {
        console.error("[ghl] backfill failed:", e instanceof Error ? e.message : e);
      }
    });
    const res = NextResponse.redirect(new URL("/settings?ghl=connected", url));
    res.cookies.set(LOCATION_COOKIE, locationId, { ...sessionCookieOptions, httpOnly: false });
    res.cookies.delete("ghl_oauth_state");
    return res;
  } catch (e) {
    console.error("[ghl] install failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL("/settings?ghl=error", url));
  }
}
