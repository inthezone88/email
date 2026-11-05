import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "../crypto";
export { verifyMarketplaceSignature } from "./signature";
import { mapAppointmentStatus, mapOpportunityStatus, normalizeEmailEvent, toCents } from "./mappers";
import { deleteContactData, parseUtm, recordEmailEvent, resolveEmail, upsertAppointment, upsertContact, upsertOpportunity } from "../ingest";
import { attributeContacts } from "../attribution";
import { ingestTransaction, type GhlTxn } from "./sync";

/** Returns false if we've already processed this delivery (idempotency). */
export async function claimDelivery(id: string, locationId: string | null): Promise<boolean> {
  const r = await db.insert(schema.webhookReceipts).values({ id, locationId }).onConflictDoNothing().returning({ id: schema.webhookReceipts.id });
  return r.length > 0;
}

export function deliveryId(body: Record<string, unknown>, raw: string) {
  const id = body.webhookId ?? body.id ?? body.eventId;
  return typeof id === "string" && id.length > 6 && body.type ? `${body.type}:${id}` : "h:" + sha256(raw);
}

type Body = Record<string, unknown> & { type?: string; locationId?: string };

async function knownLocation(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const l = await db.query.locations.findFirst({ where: eq(schema.locations.id, id), columns: { id: true } });
  return !!l;
}

/** Handle one marketplace/workflow event. Returns a short status for logs (no PII). */
export async function handleEvent(body: Body): Promise<string> {
  const locationId = (body.locationId ?? body.location_id ?? (body.location as { id?: string } | undefined)?.id) as string | undefined;
  if (!(await knownLocation(locationId))) return "ignored:unknown_location";
  const loc = locationId!;
  const type = String(body.type ?? body.event ?? "");
  const touched = new Set<string>();

  switch (type) {
    case "ContactCreate":
    case "ContactUpdate":
    case "ContactTagUpdate": {
      if (typeof body.id !== "string") return "ignored";
      await upsertContact({
        locationId: loc,
        id: body.id,
        firstName: (body.firstName as string) ?? null,
        lastName: (body.lastName as string) ?? null,
        email: (body.email as string) ?? null,
        source: (body.source as string) ?? null,
        tags: (body.tags as string[]) ?? [],
        createdAt: body.dateAdded ? new Date(body.dateAdded as string) : null,
      });
      return "contact";
    }
    case "ContactDelete":
      if (typeof body.id === "string") await deleteContactData(loc, body.id);
      return "contact_deleted";

    case "AppointmentCreate":
    case "AppointmentUpdate":
    case "AppointmentDelete": {
      const a = (body.appointment ?? body) as Record<string, string>;
      if (!a.id || !a.contactId) return "ignored";
      await upsertAppointment({
        locationId: loc,
        id: a.id,
        contactId: a.contactId,
        calendarId: a.calendarId ?? null,
        title: a.title ?? null,
        status: type === "AppointmentDelete" ? "cancelled" : mapAppointmentStatus(a.appointmentStatus ?? a.status),
        bookedAt: new Date(a.dateAdded ?? Date.now()),
        startAt: a.startTime ? new Date(a.startTime) : null,
      });
      touched.add(a.contactId);
      break;
    }

    case "OpportunityCreate":
    case "OpportunityUpdate":
    case "OpportunityStatusUpdate":
    case "OpportunityMonetaryValueUpdate": {
      if (typeof body.id !== "string") return "ignored";
      await upsertOpportunity({
        locationId: loc,
        id: body.id,
        contactId: (body.contactId as string) ?? null,
        name: (body.name as string) ?? null,
        valueCents: toCents(body.monetaryValue),
        status: mapOpportunityStatus(body.status as string),
        pipelineId: (body.pipelineId as string) ?? null,
        stage: (body.pipelineStageId as string) ?? null,
      });
      return "opportunity";
    }

    case "OrderCreate":
    case "OrderStatusUpdate":
    case "InvoicePaid":
    case "PaymentReceived":
    case "TransactionCreate":
    case "TransactionUpdate": {
      const t = (body.transaction ?? body.order ?? body) as GhlTxn & { amount?: number; contactId?: string };
      for (const c of await ingestTransaction(loc, t, "webhook")) touched.add(c);
      break;
    }

    default: {
      // Email events: LCEmailStats (marketplace) or our workflow webhook.
      const ev = normalizeEmailEvent(body);
      if (!ev || !ev.contactId) return `ignored:${type || "unknown"}`;
      const utm = parseUtm(ev.url);
      const emailId = await resolveEmail(loc, {
        emailId: ev.emailId,
        ghlRef: ev.messageId ?? ev.campaignRef,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
        subject: ev.subject,
        fromAddress: ev.fromAddress,
        at: ev.at,
      });
      if (!emailId) return "ignored:no_email";
      const id = await recordEmailEvent({
        locationId: loc,
        emailId,
        contactId: ev.contactId,
        type: ev.type,
        occurredAt: ev.at,
        url: ev.url,
        source: "ghl_webhook",
      });
      if (id && ev.type === "clicked") touched.add(ev.contactId);
      break;
    }
  }
  if (touched.size) await attributeContacts(loc, [...touched]);
  return type || "email_event";
}
