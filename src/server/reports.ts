import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { healthStatus, subjectStyleGroups, toCampaignRow, totals, winnersAndLosers, type CampaignRow } from "@/lib/metrics";
import { buildTimeline } from "@/lib/journey";
import * as q from "./queries";
import { getSettings } from "./attribution";

/** Shared response envelope bits every dashboard needs. */
export async function meta(locationId: string) {
  const loc = await db.query.locations.findFirst({ where: eq(schema.locations.id, locationId) });
  const s = await getSettings(locationId);
  return {
    location: { id: locationId, name: loc?.name ?? "", status: loc?.status ?? "disconnected" },
    lastSyncedAt: loc?.lastSyncedAt?.toISOString() ?? null,
    syncError: loc?.lastSyncError ?? null,
    settings: { windowDays: s.windowDays, model: s.model, reattributing: s.reattributing },
  };
}

export async function campaigns(locationId: string, range: number) {
  const aggs = await q.emailAggs(locationId, range);
  // Sequence steps are reported on the Sequences tab; Campaigns shows one-off sends.
  return aggs.filter((a) => !a.sequenceStepId).map(toCampaignRow);
}

export async function summary(locationId: string, range: number) {
  const rows: CampaignRow[] = await campaigns(locationId, range);
  const T = totals(rows);
  const un = await q.unattributed(locationId, range);
  const alerts = await db
    .select({ severity: schema.alerts.severity, text: schema.alerts.text, createdAt: schema.alerts.createdAt })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.locationId, locationId), isNull(schema.alerts.resolvedAt)))
    .orderBy(desc(schema.alerts.createdAt))
    .limit(6);
  const order = { red: 0, amber: 1, green: 2 } as const;
  return {
    totals: T,
    unattributed: un,
    winners: winnersAndLosers(rows),
    styles: subjectStyleGroups(rows),
    alerts: alerts.sort((a, b) => order[a.severity] - order[b.severity]),
  };
}

export async function sequences(locationId: string, range: number) {
  const aggs = (await q.emailAggs(locationId, range)).filter((a) => a.sequenceStepId);
  const { seqs, steps } = await q.sequenceStructure(locationId);
  return seqs
    .map((s) => {
      const st = steps.filter((x) => x.sequenceId === s.id);
      const stepRows = st.map((step) => {
        const mine = aggs.filter((a) => a.sequenceStepId === step.id);
        const sum = (k: "sent" | "clicks" | "booked" | "showed" | "noshow" | "sales" | "revCents") => mine.reduce((a, x) => a + x[k], 0);
        const sent = sum("sent"), booked = sum("booked");
        return {
          id: step.id,
          name: `${step.stepOrder}. ${step.name}`,
          sub: step.delayLabel ?? "",
          sent,
          ctr: sent ? sum("clicks") / sent : null,
          booked,
          show: sum("showed") + sum("noshow") ? sum("showed") / (sum("showed") + sum("noshow")) : null,
          sales: sum("sales"),
          rev: sum("revCents") / 100,
        };
      });
      const tot = stepRows.reduce((a, x) => a + x.rev, 0);
      const top = stepRows.reduce((m, x) => (x.rev > (m?.rev ?? -Infinity) ? x : m), null as (typeof stepRows)[number] | null);
      const days = st.length ? st[st.length - 1].delayLabel : null;
      const share = top && tot > 0 ? Math.round((top.rev / tot) * 100) : null;
      const noteBits = [s.note, `${st.length} emails${days ? ` over ${days.replace(/^Day\s*/i, "")} days` : ""}`, share !== null && top ? `${share}% of revenue comes from step ${top.name.split(".")[0]}` : null];
      return {
        id: s.id,
        title: s.name,
        note: noteBits.filter(Boolean).join(" · "),
        steps: stepRows.map((x) => ({ ...x, share: tot > 0 ? x.rev / tot : null, top: !!top && x.id === top.id && x.rev > 0 })),
      };
    })
    .filter((s) => s.steps.some((x) => x.sent > 0));
}

export async function segments(locationId: string, range: number, dim: "list" | "source" | "sender") {
  const r = await q.segmentAggs(locationId, range, dim);
  const months = range / 30;
  return r
    .map((x) => ({
      name: x.key,
      sub: x.contacts ? `${Math.round(x.sent / x.contacts / months)} emails/mo` : "",
      contacts: x.contacts,
      ctr: x.sent ? x.clicks / x.sent : null,
      booked: x.booked,
      show: x.showed + x.noshow ? x.showed / (x.showed + x.noshow) : null,
      rev: x.revCents / 100,
      rpe: x.sent ? (x.revCents / 100 / x.sent) * 1000 : null,
    }))
    .sort((a, b) => b.rev - a.rev);
}

export async function health(locationId: string, range: number) {
  const aggs = await q.emailAggs(locationId, range);
  return aggs.map((a) => {
    const bounce = a.sent ? a.bounced / a.sent : 0;
    const spam = a.sent ? a.complained / a.sent : 0;
    const unsub = a.sent ? a.unsubscribed / a.sent : 0;
    return { id: a.id, name: a.name, sentAt: a.sentAt, sent: a.sent, bounce, spam, unsub, status: healthStatus(bounce, spam, unsub) };
  });
}

export async function overview(locationId: string, range: number) {
  const aggs = await q.emailAggs(locationId, range);
  const T = aggs.reduce(
    (a, x) => ({ sent: a.sent + x.sent, clicks: a.clicks + x.clicks, booked: a.booked + x.booked, sales: a.sales + x.sales, rev: a.rev + x.revCents / 100 }),
    { sent: 0, clicks: 0, booked: 0, sales: 0, rev: 0 },
  );
  const byDay = await q.revenueByDay(locationId, range);
  // Bucket into at most 30 bars.
  const nBars = Math.min(range, 30);
  const per = range / nBars;
  const start = Date.now() - range * 86_400_000;
  const bars = Array.from({ length: nBars }, () => 0);
  for (const d of byDay) {
    const i = Math.min(nBars - 1, Math.max(0, Math.floor((new Date(d.day + "T00:00:00Z").getTime() - start) / 86_400_000 / per)));
    bars[i] += d.revCents / 100;
  }
  const emails = aggs.map((a) => ({
    id: a.id,
    name: a.name,
    sentAt: a.sentAt,
    sent: a.sent,
    clicks: a.clicks,
    booked: a.booked,
    sales: a.sales,
    rev: a.revCents / 100,
    bounce: a.sent ? a.bounced / a.sent : 0,
    unsub: a.sent ? a.unsubscribed / a.sent : 0,
    utm: a.utmCampaign,
  }));
  return { totals: T, bars, emails };
}

export async function contactJourney(locationId: string, contactId: string) {
  const j = await q.journey(locationId, contactId);
  if (!j.contact) return null;
  return {
    id: j.contact.id,
    name: q.displayName(j.contact.first, j.contact.last, j.contact.email),
    events: buildTimeline(j.events, j.credits),
  };
}
