import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "../crypto";

/**
 * GoHighLevel API v2 client.
 * VERIFY against https://marketplace.gohighlevel.com/docs before go-live:
 *  - base URL, `Version` header value, token endpoint params, scope names.
 * All are overridable via env so a docs change doesn't need a code change.
 */
export const GHL = {
  apiBase: () => process.env.GHL_API_BASE ?? "https://services.leadconnectorhq.com",
  authBase: () => process.env.GHL_AUTH_BASE ?? "https://marketplace.gohighlevel.com",
  version: () => process.env.GHL_API_VERSION ?? "2021-07-28",
  clientId: () => must("GHL_CLIENT_ID"),
  clientSecret: () => must("GHL_CLIENT_SECRET"),
  redirectUri: () => must("GHL_REDIRECT_URI"),
};

/** Read-only scopes (VERIFY exact names in the GHL scope list). */
export const GHL_SCOPES = [
  "contacts.readonly",
  "locations.readonly",
  "locations/tags.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "opportunities.readonly",
  "payments/orders.readonly",
  "payments/transactions.readonly",
  "campaigns.readonly",
  "workflows.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
];

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export class GhlError extends Error {
  constructor(public status: number, message: string, public code: "auth" | "rate_limit" | "http" = "http") {
    super(message);
  }
}

export function authorizeUrl(state: string) {
  const u = new URL("/oauth/chooselocation", GHL.authBase());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", GHL.redirectUri());
  u.searchParams.set("client_id", GHL.clientId());
  u.searchParams.set("scope", GHL_SCOPES.join(" "));
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  locationId?: string;
  companyId?: string;
  userType?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${GHL.apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: GHL.clientId(), client_secret: GHL.clientSecret(), user_type: "Location", ...params }),
  });
  if (!res.ok) throw new GhlError(res.status, `Token request failed (${res.status})`, "auth");
  return res.json();
}

export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: GHL.redirectUri() });

async function storeTokens(locationId: string, t: TokenResponse) {
  await db
    .update(schema.locations)
    .set({
      accessTokenEnc: encrypt(t.access_token),
      refreshTokenEnc: encrypt(t.refresh_token),
      tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
      scopes: t.scope ?? null,
      status: "connected",
      lastSyncError: null,
    })
    .where(eq(schema.locations.id, locationId));
}

export async function saveInstall(t: TokenResponse, ownerUserId: string) {
  if (!t.locationId) throw new GhlError(400, "Token response has no locationId. Install the app on a sub-account, not an agency.");
  await db
    .insert(schema.locations)
    .values({ id: t.locationId, name: t.locationId, companyId: t.companyId ?? null, status: "connected" })
    .onConflictDoUpdate({ target: schema.locations.id, set: { status: "connected", companyId: t.companyId ?? null } });
  await storeTokens(t.locationId, t);
  await db.insert(schema.settings).values({ locationId: t.locationId }).onConflictDoNothing();
  await db.insert(schema.userLocations).values({ userId: ownerUserId, locationId: t.locationId, role: "owner" }).onConflictDoNothing();
  // Fill in the human name.
  try {
    const loc = await ghlFetch<{ location?: { name?: string } }>(t.locationId, `/locations/${t.locationId}`);
    if (loc.location?.name) await db.update(schema.locations).set({ name: loc.location.name }).where(eq(schema.locations.id, t.locationId));
  } catch {
    /* name is cosmetic */
  }
  return t.locationId;
}

const refreshing = new Map<string, Promise<string>>();

/** Valid access token for a location, refreshing if it expires within 10 minutes. */
export async function accessToken(locationId: string, force = false): Promise<string> {
  const loc = await db.query.locations.findFirst({ where: eq(schema.locations.id, locationId) });
  if (!loc?.accessTokenEnc || !loc.refreshTokenEnc) throw new GhlError(401, "Sub-account is not connected", "auth");
  const soon = !loc.tokenExpiresAt || loc.tokenExpiresAt.getTime() - Date.now() < 10 * 60_000;
  if (!force && !soon) return decrypt(loc.accessTokenEnc);
  const inflight = refreshing.get(locationId);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(loc.refreshTokenEnc!) });
      await storeTokens(locationId, t);
      return t.access_token;
    } catch (e) {
      await db
        .update(schema.locations)
        .set({ status: "error", lastSyncError: "Token refresh failed. Reconnect the sub-account." })
        .where(eq(schema.locations.id, locationId));
      throw e;
    } finally {
      refreshing.delete(locationId);
    }
  })();
  refreshing.set(locationId, p);
  return p;
}

/** Authenticated GET/POST against the GHL API with refresh-on-401 and simple 429 backoff. */
export async function ghlFetch<T>(locationId: string, path: string, init: { method?: string; query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<T> {
  const url = new URL(path, GHL.apiBase());
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  let token = await accessToken(locationId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL.version(),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(locationId, true);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 10_000)));
      continue;
    }
    if (!res.ok) throw new GhlError(res.status, `GHL ${init.method ?? "GET"} ${url.pathname} → ${res.status}`, res.status === 401 ? "auth" : "http");
    return res.json() as Promise<T>;
  }
  throw new GhlError(429, `GHL ${url.pathname} kept failing after retries`, "rate_limit");
}

export async function disconnect(locationId: string) {
  await db
    .update(schema.locations)
    .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null })
    .where(eq(schema.locations.id, locationId));
}
