import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate: no session cookie → /login. Real verification happens server-side in
 * requireCtx()/getSession() on every page and API call.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("er_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/campaigns", "/sequences", "/segments", "/health", "/journeys", "/settings", "/overview", "/emails", "/more"],
};
