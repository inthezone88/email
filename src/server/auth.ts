import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "er_session";
export const LOCATION_COOKIE = "er_loc";
const SESSION_DAYS = 30;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
};

export interface Session {
  userId: string;
  email: string;
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { userId: payload.sub!, email: String(payload.email) };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export interface Ctx {
  session: Session;
  isAdmin: boolean;
  locationId: string;
  location: typeof schema.locations.$inferSelect;
}

/** Locations the user may see. Admins see all. */
export async function accessibleLocations(session: Session) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) });
  if (!user) throw new HttpError(401, "Unknown user");
  if (user.isAdmin) return { isAdmin: true, locations: await db.select().from(schema.locations).orderBy(schema.locations.name) };
  const rows = await db
    .select({ l: schema.locations })
    .from(schema.userLocations)
    .innerJoin(schema.locations, eq(schema.userLocations.locationId, schema.locations.id))
    .where(eq(schema.userLocations.userId, session.userId))
    .orderBy(schema.locations.name);
  return { isAdmin: false, locations: rows.map((r) => r.l) };
}

/** Resolve the session + current location for an API call. Every data query is scoped by ctx.locationId. */
export async function requireCtx(opts: { allowNoLocation?: boolean } = {}): Promise<Ctx> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  const { isAdmin, locations } = await accessibleLocations(session);
  const jar = await cookies();
  const wanted = jar.get(LOCATION_COOKIE)?.value;
  const location = locations.find((l) => l.id === wanted) ?? locations.find((l) => l.status !== "demo") ?? locations[0];
  if (!location) {
    if (opts.allowNoLocation) return { session, isAdmin, locationId: "", location: null as never };
    throw new HttpError(409, "No sub-account connected yet", "no_location");
  }
  return { session, isAdmin, locationId: location.id, location };
}

export async function canAccessLocation(session: Session, locationId: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.userId) });
  if (user?.isAdmin) return true;
  const m = await db
    .select()
    .from(schema.userLocations)
    .where(and(eq(schema.userLocations.userId, session.userId), eq(schema.userLocations.locationId, locationId)));
  return m.length > 0;
}
