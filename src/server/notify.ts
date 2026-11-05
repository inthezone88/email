import "server-only";
import { eq, inArray, or } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/db";

export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.info(`[email:dev] to=<redacted> subject="${subject}"\n${text}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Email Revenue <onboarding@resend.dev>", to, subject, text }),
  });
  if (!res.ok) console.error("[email] send failed", res.status);
  return res.ok;
}

function pushReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return true;
}

/** Notify everyone with access to a location (members + admins) by push and email. */
export async function notifyLocation(locationId: string, items: { severity: string; text: string }[]) {
  const loc = await db.query.locations.findFirst({ where: eq(schema.locations.id, locationId) });
  if (!loc || loc.status === "demo") return;
  const members = await db.select({ userId: schema.userLocations.userId }).from(schema.userLocations).where(eq(schema.userLocations.locationId, locationId));
  const users = await db
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.isAdmin, true), members.length ? inArray(schema.users.id, members.map((m) => m.userId)) : undefined));

  const important = items.filter((i) => i.severity !== "green");
  const title = important.length ? `${important.length} email issue${important.length > 1 ? "s" : ""} need attention` : "Email update";
  const body = items.map((i) => `• ${i.text}`).join("\n");

  if (pushReady() && users.length) {
    const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, users.map((u) => u.id)));
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: `${loc.name}: ${title}`, body: items[0]?.text ?? "", url: "/campaigns" }));
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        }
      }),
    );
  }
  for (const u of users) await sendEmail(u.email, `${loc.name}: ${title}`, `${body}\n\n${process.env.APP_URL ?? ""}/campaigns`);
}
