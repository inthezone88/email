import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { evaluateAlerts } from "@/lib/alerts";
import { emailAggs, bookedWeekOverWeek } from "./queries";
import { getSettings } from "./attribution";
import { notifyLocation } from "./notify";

/** Evaluate rules, upsert active alerts, resolve ones that no longer fire, notify on new red/green ones. */
export async function runAlerts(locationId: string) {
  const s = await getSettings(locationId);
  const aggs = await emailAggs(locationId, 90);
  const wow = await bookedWeekOverWeek(locationId);
  const found = evaluateAlerts({
    now: new Date(),
    windowDays: s.windowDays,
    bookedThisWeek: wow?.thisWeek ?? 0,
    bookedLastWeek: wow?.lastWeek ?? 0,
    topBookerThisWeek: wow?.top ?? null,
    emails: aggs.map((a) => ({ id: a.id, name: a.name, sentAt: new Date(a.sentAt), sent: a.sent, bounced: a.bounced, complained: a.complained, booked: a.booked, showed: a.showed, noshow: a.noshow, revCents: a.revCents })),
  });

  const fps = found.map((f) => f.fingerprint);
  for (const f of found) {
    await db
      .insert(schema.alerts)
      .values({ locationId, ...f })
      .onConflictDoUpdate({ target: [schema.alerts.locationId, schema.alerts.fingerprint], set: { text: f.text, severity: f.severity, resolvedAt: null } });
  }
  await db
    .update(schema.alerts)
    .set({ resolvedAt: sql`now()` })
    .where(and(eq(schema.alerts.locationId, locationId), isNull(schema.alerts.resolvedAt), fps.length ? notInArray(schema.alerts.fingerprint, fps) : undefined));

  // Notify once per alert.
  const pending = await db
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.locationId, locationId), isNull(schema.alerts.resolvedAt), isNull(schema.alerts.notifiedAt)));
  if (pending.length) {
    await notifyLocation(locationId, pending.map((p) => ({ severity: p.severity, text: p.text })));
    await db.update(schema.alerts).set({ notifiedAt: sql`now()` }).where(inArray(schema.alerts.id, pending.map((p) => p.id)));
  }
  return found.length;
}
