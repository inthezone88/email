import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { attribute, type Click, type Conversion, type AttributionSettings } from "@/lib/attribution";

const { emailEvents, appointments, payments, attributions, settings } = schema;

export async function getSettings(locationId: string): Promise<AttributionSettings & { reattributing: boolean }> {
  const s = await db.query.settings.findFirst({ where: eq(settings.locationId, locationId) });
  if (s) return { windowDays: s.windowDays, model: s.model, reattributing: s.reattributing };
  await db.insert(settings).values({ locationId }).onConflictDoNothing();
  return { windowDays: 14, model: "last_click", reattributing: false };
}

async function load(locationId: string, contactIds?: string[]) {
  const byContact = (col: Parameters<typeof inArray>[0]) => (contactIds ? inArray(col, contactIds) : undefined);
  const clickRows = await db
    .select({ id: emailEvents.id, contactId: emailEvents.contactId, emailId: emailEvents.emailId, at: emailEvents.occurredAt })
    .from(emailEvents)
    .where(and(eq(emailEvents.locationId, locationId), eq(emailEvents.type, "clicked"), byContact(emailEvents.contactId)));
  const appts = await db
    .select({ id: appointments.id, contactId: appointments.contactId, at: appointments.bookedAt })
    .from(appointments)
    .where(and(eq(appointments.locationId, locationId), byContact(appointments.contactId)));
  const pays = await db
    .select({ id: payments.id, contactId: payments.contactId, at: payments.paidAt, amountCents: payments.amountCents, refundOf: payments.refundOf })
    .from(payments)
    .where(and(eq(payments.locationId, locationId), byContact(payments.contactId)));
  const clicks: Click[] = clickRows;
  const conversions: Conversion[] = [
    ...appts.map((a) => ({ type: "appointment" as const, ...a })),
    ...pays.map((p) => ({ type: "payment" as const, ...p })),
  ];
  return { clicks, conversions };
}

async function write(locationId: string, rows: ReturnType<typeof attribute>, contactIds?: string[]) {
  await db.transaction(async (tx) => {
    await tx
      .delete(attributions)
      .where(and(eq(attributions.locationId, locationId), contactIds ? inArray(attributions.contactId, contactIds) : undefined));
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000).map((r) => ({ locationId, ...r }));
      if (chunk.length) await tx.insert(attributions).values(chunk);
    }
  });
}

/** Re-attribute a few contacts (called after a new click or conversion arrives). */
export async function attributeContacts(locationId: string, contactIds: string[]) {
  if (!contactIds.length) return;
  const s = await getSettings(locationId);
  const { clicks, conversions } = await load(locationId, contactIds);
  await write(locationId, attribute(clicks, conversions, s), contactIds);
}

/** Rebuild the whole attributions table for a location (settings changed, backfill, nightly). */
export async function rebuildAttributions(locationId: string) {
  const s = await getSettings(locationId);
  await db.update(settings).set({ reattributing: true }).where(eq(settings.locationId, locationId));
  try {
    const { clicks, conversions } = await load(locationId);
    const rows = attribute(clicks, conversions, s);
    await write(locationId, rows);
    return { conversions: rows.length, unattributed: rows.filter((r) => !r.emailId).length };
  } finally {
    await db
      .update(settings)
      .set({ reattributing: false, attributedAt: sql`now()` })
      .where(eq(settings.locationId, locationId));
  }
}
