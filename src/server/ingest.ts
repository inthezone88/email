import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { classifySubject } from "@/lib/subject";
import { randomId } from "./crypto";

const { emails, emailEvents, contacts, appointments, opportunities, payments } = schema;

export type EventType = (typeof schema.emailEventType.enumValues)[number];

export function parseUtm(url: string | null | undefined) {
  if (!url) return {};
  try {
    const u = new URL(url);
    return {
      source: u.searchParams.get("utm_source") ?? undefined,
      medium: u.searchParams.get("utm_medium") ?? undefined,
      campaign: u.searchParams.get("utm_campaign") ?? undefined,
      content: u.searchParams.get("utm_content") ?? undefined,
    };
  } catch {
    return {};
  }
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Find (or create) the email send an event belongs to. Lookup order:
 * explicit email id → GHL reference → utm_content (our email id or step id) → utm_campaign.
 * Unknown sends are created with needsReview=true so they show up in the link audit.
 */
export async function resolveEmail(
  locationId: string,
  hint: { emailId?: string | null; ghlRef?: string | null; utmCampaign?: string | null; utmContent?: string | null; subject?: string | null; fromAddress?: string | null; at?: Date; name?: string | null },
): Promise<string | null> {
  if (hint.emailId) {
    const e = await db.query.emails.findFirst({ where: and(eq(emails.locationId, locationId), eq(emails.id, hint.emailId)) });
    if (e) return e.id;
  }
  if (hint.ghlRef) {
    const e = await db.query.emails.findFirst({ where: and(eq(emails.locationId, locationId), eq(emails.ghlRef, hint.ghlRef)) });
    if (e) return e.id;
  }
  if (hint.utmContent) {
    const e = await db.query.emails.findFirst({
      where: and(eq(emails.locationId, locationId), sql`(${emails.id} = ${hint.utmContent} or ${emails.utmContent} = ${hint.utmContent})`),
    });
    if (e) return e.id;
  }
  if (hint.utmCampaign) {
    const e = await db.query.emails.findFirst({
      where: and(eq(emails.locationId, locationId), eq(emails.utmCampaign, hint.utmCampaign)),
      orderBy: sql`${emails.sentAt} desc`,
    });
    if (e) return e.id;
  }
  if (!hint.ghlRef && !hint.utmCampaign && !hint.subject) return null;
  const id = "em_" + randomId(10);
  await db.insert(emails).values({
    locationId,
    id,
    name: hint.name || hint.subject || hint.utmCampaign || "Untitled email",
    subject: hint.subject ?? null,
    subjectStyle: classifySubject(hint.subject ?? hint.name),
    fromAddress: hint.fromAddress ?? null,
    utmCampaign: hint.utmCampaign ?? (hint.subject ? slugify(hint.subject) : null),
    utmContent: hint.utmContent ?? null,
    ghlRef: hint.ghlRef ?? null,
    needsReview: !hint.utmCampaign,
    sentAt: hint.at ?? new Date(),
  });
  return id;
}

/** Idempotent insert; returns the new row id, or null when it was a duplicate. */
export async function recordEmailEvent(e: {
  locationId: string;
  emailId: string;
  contactId: string;
  type: EventType;
  occurredAt: Date;
  url?: string | null;
  source: string;
  dedupeKey?: string;
}): Promise<number | null> {
  const dedupeKey = e.dedupeKey ?? `${e.type}:${e.emailId}:${e.contactId}:${e.occurredAt.toISOString()}`;
  const rows = await db
    .insert(emailEvents)
    .values({ ...e, url: e.url ?? null, dedupeKey })
    .onConflictDoNothing()
    .returning({ id: emailEvents.id });
  return rows[0]?.id ?? null;
}

export async function upsertContact(c: typeof contacts.$inferInsert) {
  await db
    .insert(contacts)
    .values(c)
    .onConflictDoUpdate({
      target: [contacts.locationId, contacts.id],
      set: { firstName: c.firstName, lastName: c.lastName, email: c.email, source: c.source, tags: c.tags, updatedAt: sql`now()` },
    });
}

export async function upsertAppointment(a: typeof appointments.$inferInsert) {
  await db
    .insert(appointments)
    .values(a)
    .onConflictDoUpdate({
      target: [appointments.locationId, appointments.id],
      set: { status: a.status, startAt: a.startAt, title: a.title, calendarId: a.calendarId, contactId: a.contactId, updatedAt: sql`now()` },
    });
}

export async function upsertOpportunity(o: typeof opportunities.$inferInsert) {
  await db
    .insert(opportunities)
    .values(o)
    .onConflictDoUpdate({
      target: [opportunities.locationId, opportunities.id],
      set: { status: o.status, valueCents: o.valueCents, stage: o.stage, name: o.name, contactId: o.contactId, updatedAt: sql`now()` },
    });
}

export async function upsertPayment(p: typeof payments.$inferInsert) {
  await db
    .insert(payments)
    .values(p)
    .onConflictDoUpdate({
      target: [payments.locationId, payments.id],
      set: { amountCents: p.amountCents, paidAt: p.paidAt, description: p.description, refundOf: p.refundOf },
    });
}

/** GDPR-style deletion of one contact and everything tied to them. */
export async function deleteContactData(locationId: string, contactId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.attributions).where(and(eq(schema.attributions.locationId, locationId), eq(schema.attributions.contactId, contactId)));
    await tx.delete(emailEvents).where(and(eq(emailEvents.locationId, locationId), eq(emailEvents.contactId, contactId)));
    await tx.delete(appointments).where(and(eq(appointments.locationId, locationId), eq(appointments.contactId, contactId)));
    await tx.delete(payments).where(and(eq(payments.locationId, locationId), eq(payments.contactId, contactId)));
    await tx.delete(opportunities).where(and(eq(opportunities.locationId, locationId), eq(opportunities.contactId, contactId)));
    await tx.delete(contacts).where(and(eq(contacts.locationId, locationId), eq(contacts.id, contactId)));
  });
}
