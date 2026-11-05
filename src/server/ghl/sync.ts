import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ghlFetch, GhlError } from "./client";
import { mapAppointmentStatus, mapOpportunityStatus, toCents } from "./mappers";
import { upsertAppointment, upsertContact, upsertOpportunity, upsertPayment } from "../ingest";
import { rebuildAttributions } from "../attribution";
import { runAlerts } from "../alerts";

/**
 * Backfill (first connect) and nightly reconcile. Webhooks keep data current in between;
 * reconcile catches anything a webhook missed (status changes, refunds).
 *
 * VERIFY: endpoint paths, query params and response shapes below against current GHL docs.
 * Each fetcher is defensive about field names and stops on empty pages.
 */

const MAX_PAGES = 500;
type Stats = Record<string, number>;

async function syncContacts(locationId: string, stats: Stats) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await ghlFetch<{ contacts?: GhlContact[] }>(locationId, "/contacts/search", {
      method: "POST",
      body: { locationId, pageLimit: 100, page },
    });
    const list = r.contacts ?? [];
    for (const c of list) {
      await upsertContact({
        locationId,
        id: c.id,
        firstName: c.firstName ?? c.firstNameRaw ?? null,
        lastName: c.lastName ?? c.lastNameRaw ?? null,
        email: c.email ?? null,
        source: c.source ?? c.attributionSource?.medium ?? null,
        tags: c.tags ?? [],
        createdAt: c.dateAdded ? new Date(c.dateAdded) : null,
      });
    }
    stats.contacts = (stats.contacts ?? 0) + list.length;
    if (list.length < 100) break;
  }
}

async function syncAppointments(locationId: string, sinceDays: number, stats: Stats) {
  const cals = await ghlFetch<{ calendars?: { id: string }[] }>(locationId, "/calendars/", { query: { locationId } });
  const start = Date.now() - sinceDays * 86_400_000;
  const end = Date.now() + 60 * 86_400_000;
  for (const cal of cals.calendars ?? []) {
    const r = await ghlFetch<{ events?: GhlEvent[] }>(locationId, "/calendars/events", {
      query: { locationId, calendarId: cal.id, startTime: start, endTime: end },
    });
    for (const e of r.events ?? []) {
      if (!e.contactId) continue;
      await upsertAppointment({
        locationId,
        id: e.id,
        contactId: e.contactId,
        calendarId: e.calendarId ?? cal.id,
        title: e.title ?? null,
        status: mapAppointmentStatus(e.appointmentStatus ?? e.status),
        bookedAt: new Date(e.dateAdded ?? e.startTime),
        startAt: e.startTime ? new Date(e.startTime) : null,
      });
      stats.appointments = (stats.appointments ?? 0) + 1;
    }
  }
}

async function syncOpportunities(locationId: string, stats: Stats) {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await ghlFetch<{ opportunities?: GhlOpp[]; meta?: { nextPage?: number | null } }>(locationId, "/opportunities/search", {
      query: { location_id: locationId, limit: 100, page },
    });
    const list = r.opportunities ?? [];
    for (const o of list) {
      await upsertOpportunity({
        locationId,
        id: o.id,
        contactId: o.contactId ?? o.contact?.id ?? null,
        name: o.name ?? null,
        valueCents: toCents(o.monetaryValue),
        status: mapOpportunityStatus(o.status),
        pipelineId: o.pipelineId ?? null,
        stage: o.pipelineStageId ?? null,
      });
    }
    stats.opportunities = (stats.opportunities ?? 0) + list.length;
    if (!r.meta?.nextPage || list.length === 0) break;
  }
}

async function syncPayments(locationId: string, stats: Stats) {
  for (let offset = 0, i = 0; i < MAX_PAGES; i++, offset += 100) {
    const r = await ghlFetch<{ data?: GhlTxn[] }>(locationId, "/payments/transactions", {
      query: { altId: locationId, altType: "location", limit: 100, offset },
    });
    const list = r.data ?? [];
    for (const t of list) await ingestTransaction(locationId, t, "reconcile");
    stats.payments = (stats.payments ?? 0) + list.length;
    if (list.length < 100) break;
  }
}

export async function ingestTransaction(locationId: string, t: GhlTxn, source: string) {
  const id = t._id ?? t.id;
  const contactId = t.contactId ?? t.contactSnapshot?.id;
  if (!id || !contactId) return [];
  const ok = ["succeeded", "paid", "completed", "refunded", "partially_refunded"].includes((t.status ?? "").toLowerCase());
  if (!ok) return [];
  await upsertPayment({
    locationId,
    id,
    contactId,
    amountCents: toCents(t.amount),
    description: t.entityDescription ?? t.description ?? null,
    paidAt: new Date(t.createdAt ?? Date.now()),
    source,
  });
  const refunded = toCents(t.amountRefunded);
  if (refunded > 0) {
    await upsertPayment({
      locationId,
      id: `${id}:refund`,
      contactId,
      amountCents: -refunded,
      refundOf: id,
      description: "Refund",
      paidAt: new Date(t.updatedAt ?? t.createdAt ?? Date.now()),
      source,
    });
  }
  return [contactId];
}

async function syncSequencesAndCampaigns(locationId: string, stats: Stats) {
  try {
    const wf = await ghlFetch<{ workflows?: { id: string; name: string }[] }>(locationId, "/workflows/", { query: { locationId } });
    for (const w of wf.workflows ?? []) {
      await db
        .insert(schema.sequences)
        .values({ locationId, id: w.id, name: w.name })
        .onConflictDoUpdate({ target: [schema.sequences.locationId, schema.sequences.id], set: { name: w.name } });
    }
    stats.workflows = wf.workflows?.length ?? 0;
  } catch (e) {
    if (!(e instanceof GhlError) || e.status !== 403) throw e; // missing scope is non-fatal
  }
  try {
    const c = await ghlFetch<{ campaigns?: { id: string; name: string }[] }>(locationId, "/campaigns/", { query: { locationId } });
    for (const x of c.campaigns ?? []) {
      await db
        .insert(schema.campaigns)
        .values({ locationId, id: x.id, name: x.name, ghlRef: x.id })
        .onConflictDoUpdate({ target: [schema.campaigns.locationId, schema.campaigns.id], set: { name: x.name } });
    }
    stats.campaigns = c.campaigns?.length ?? 0;
  } catch (e) {
    if (!(e instanceof GhlError) || e.status !== 403) throw e;
  }
}

/** Full sync. `backfill` pulls a year of history; reconcile pulls the last 90 days of appointments. */
export async function syncLocation(locationId: string, kind: "backfill" | "reconcile") {
  const [run] = await db.insert(schema.syncRuns).values({ locationId, kind }).returning({ id: schema.syncRuns.id });
  const stats: Stats = {};
  try {
    await syncSequencesAndCampaigns(locationId, stats);
    await syncContacts(locationId, stats);
    await syncAppointments(locationId, kind === "backfill" ? 365 : 90, stats);
    await syncOpportunities(locationId, stats);
    await syncPayments(locationId, stats);
    const a = await rebuildAttributions(locationId);
    Object.assign(stats, a);
    await runAlerts(locationId);
    await db
      .update(schema.locations)
      .set({ lastSyncedAt: sql`now()`, lastSyncError: null, ...(kind === "backfill" ? { backfilledAt: sql`now()` } : {}) })
      .where(eq(schema.locations.id, locationId));
    await db.update(schema.syncRuns).set({ finishedAt: sql`now()`, ok: true, stats }).where(eq(schema.syncRuns.id, run.id));
    return stats;
  } catch (e) {
    const msg = e instanceof GhlError && e.code === "auth" ? "GHL rejected our token. Reconnect the sub-account." : e instanceof Error ? e.message : "Sync failed";
    await db.update(schema.locations).set({ lastSyncError: msg }).where(eq(schema.locations.id, locationId));
    await db.update(schema.syncRuns).set({ finishedAt: sql`now()`, ok: false, stats, error: msg }).where(eq(schema.syncRuns.id, run.id));
    throw e;
  }
}

// ---- loose GHL payload types (only fields we read) ----
interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  firstNameRaw?: string;
  lastNameRaw?: string;
  email?: string;
  source?: string;
  tags?: string[];
  dateAdded?: string;
  attributionSource?: { medium?: string };
}
interface GhlEvent {
  id: string;
  contactId?: string;
  calendarId?: string;
  title?: string;
  appointmentStatus?: string;
  status?: string;
  startTime: string;
  dateAdded?: string;
}
interface GhlOpp {
  id: string;
  name?: string;
  monetaryValue?: number;
  status?: string;
  contactId?: string;
  contact?: { id?: string };
  pipelineId?: string;
  pipelineStageId?: string;
}
export interface GhlTxn {
  _id?: string;
  id?: string;
  contactId?: string;
  contactSnapshot?: { id?: string };
  amount?: number;
  amountRefunded?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  entityDescription?: string;
  description?: string;
}
