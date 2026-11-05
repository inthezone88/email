import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { EmailAgg } from "@/lib/metrics";
import type { SubjectStyle } from "@/lib/subject";

async function rows<T>(q: SQL): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

const since = (days: number) => sql`${new Date(Date.now() - days * 86_400_000).toISOString()}::timestamptz`;

/** Per-send aggregates for sends in the last `days` days. Opens/clicks are unique contacts. */
export async function emailAggs(locationId: string, days: number): Promise<EmailAgg[]> {
  const from = since(days);
  const r = await rows<EmailAgg & { sentAt: Date }>(sql`
    with e as (
      select * from emails where location_id = ${locationId} and sent_at >= ${from}
    ),
    ev as (
      select email_id,
        count(distinct contact_id) filter (where type in ('sent','delivered'))::int as sent,
        count(distinct contact_id) filter (where type = 'opened')::int as opens,
        count(distinct contact_id) filter (where type = 'clicked')::int as clicks,
        count(distinct contact_id) filter (where type = 'bounced')::int as bounced,
        count(distinct contact_id) filter (where type = 'complained')::int as complained,
        count(distinct contact_id) filter (where type = 'unsubscribed')::int as unsubscribed
      from email_events
      where location_id = ${locationId} and email_id in (select id from e)
      group by email_id
    ),
    ap as (
      select a.email_id,
        count(*) filter (where p.status <> 'cancelled')::int as booked,
        count(*) filter (where p.status = 'showed')::int as showed,
        count(*) filter (where p.status = 'noshow')::int as noshow,
        coalesce(sum(extract(epoch from (a.converted_at - a.first_click_at)) / 86400.0)
          filter (where p.status <> 'cancelled' and a.first_click_at is not null), 0)::float8 as dsum,
        count(*) filter (where p.status <> 'cancelled' and a.first_click_at is not null)::int as dn
      from attributions a
      join appointments p on p.location_id = a.location_id and p.id = a.conversion_id
      where a.location_id = ${locationId} and a.conversion_type = 'appointment' and a.email_id in (select id from e)
      group by a.email_id
    ),
    pay as (
      select email_id,
        count(*) filter (where amount_cents > 0)::int as sales,
        coalesce(sum(amount_cents), 0)::float8 as rev
      from attributions
      where location_id = ${locationId} and conversion_type = 'payment' and email_id in (select id from e)
      group by email_id
    )
    select e.id, e.name, e.subject,
      coalesce(e.subject_style_override, e.subject_style)::text as "style",
      e.sent_at as "sentAt", e.from_address as "fromAddress", e.sequence_step_id as "sequenceStepId", e.utm_campaign as "utmCampaign",
      coalesce(ev.sent, 0) as sent, coalesce(ev.opens, 0) as opens, coalesce(ev.clicks, 0) as clicks,
      coalesce(ev.bounced, 0) as bounced, coalesce(ev.complained, 0) as complained, coalesce(ev.unsubscribed, 0) as unsubscribed,
      coalesce(ap.booked, 0) as booked, coalesce(ap.showed, 0) as showed, coalesce(ap.noshow, 0) as noshow,
      coalesce(pay.sales, 0) as sales, coalesce(pay.rev, 0) as "revCents",
      coalesce(ap.dsum, 0) as "daysToBookSum", coalesce(ap.dn, 0) as "daysToBookN"
    from e
    left join ev on ev.email_id = e.id
    left join ap on ap.email_id = e.id
    left join pay on pay.email_id = e.id
    order by e.sent_at desc
  `);
  return r.map((x) => ({ ...x, sentAt: new Date(x.sentAt).toISOString(), style: x.style as SubjectStyle }));
}

export async function unattributed(locationId: string, days: number) {
  const [r] = await rows<{ appointments: number; payments: number; revCents: number; total: number }>(sql`
    select
      count(*) filter (where conversion_type = 'appointment')::int as appointments,
      count(*) filter (where conversion_type = 'payment' and amount_cents > 0)::int as payments,
      coalesce(sum(amount_cents) filter (where conversion_type = 'payment'), 0)::float8 as "revCents",
      count(*)::int as total
    from attributions
    where location_id = ${locationId} and email_id is null and converted_at >= ${since(days)}
  `);
  return r;
}

export async function sequenceStructure(locationId: string) {
  const seqs = await rows<{ id: string; name: string; note: string | null }>(
    sql`select id, name, note from sequences where location_id = ${locationId} order by name`,
  );
  const steps = await rows<{ id: string; sequenceId: string; stepOrder: number; name: string; delayLabel: string | null }>(sql`
    select id, sequence_id as "sequenceId", step_order as "stepOrder", name, delay_label as "delayLabel"
    from sequence_steps where location_id = ${locationId} order by sequence_id, step_order
  `);
  return { seqs, steps };
}

export interface SegmentAgg {
  key: string;
  contacts: number;
  sent: number;
  clicks: number;
  booked: number;
  showed: number;
  noshow: number;
  revCents: number;
}

export async function segmentAggs(locationId: string, days: number, dim: "list" | "source" | "sender"): Promise<SegmentAgg[]> {
  const from = since(days);
  if (dim === "sender") {
    return rows<SegmentAgg>(sql`
      with e as (select id, coalesce(nullif(from_address, ''), 'Unknown sender') as key from emails where location_id = ${locationId} and sent_at >= ${from}),
      ev as (
        select e.key,
          count(distinct ev.contact_id)::int as contacts,
          count(distinct ev.email_id || ':' || ev.contact_id) filter (where ev.type in ('sent','delivered'))::int as sent,
          count(distinct ev.email_id || ':' || ev.contact_id) filter (where ev.type = 'clicked')::int as clicks
        from email_events ev join e on e.id = ev.email_id
        where ev.location_id = ${locationId}
        group by e.key
      ),
      cv as (
        select e.key,
          count(*) filter (where a.conversion_type = 'appointment' and p.status <> 'cancelled')::int as booked,
          count(*) filter (where a.conversion_type = 'appointment' and p.status = 'showed')::int as showed,
        count(*) filter (where a.conversion_type = 'appointment' and p.status = 'noshow')::int as noshow,
          count(*) filter (where a.conversion_type = 'appointment' and p.status = 'noshow')::int as noshow,
          coalesce(sum(a.amount_cents) filter (where a.conversion_type = 'payment'), 0)::float8 as rev
        from attributions a join e on e.id = a.email_id
        left join appointments p on a.conversion_type = 'appointment' and p.location_id = a.location_id and p.id = a.conversion_id
        where a.location_id = ${locationId}
        group by e.key
      )
      select ev.key, ev.contacts, ev.sent, ev.clicks, coalesce(cv.booked,0) as booked, coalesce(cv.showed,0) as showed, coalesce(cv.noshow,0) as noshow, coalesce(cv.rev,0) as "revCents"
      from ev left join cv on cv.key = ev.key
    `);
  }
  const segExpr =
    dim === "list"
      ? sql`select id as contact_id, unnest(case when cardinality(tags) = 0 then array['(no tag)'] else tags end) as key from contacts where location_id = ${locationId}`
      : sql`select id as contact_id, coalesce(nullif(source, ''), 'Unknown') as key from contacts where location_id = ${locationId}`;
  return rows<SegmentAgg>(sql`
    with e as (select id from emails where location_id = ${locationId} and sent_at >= ${from}),
    seg as (${segExpr}),
    cnt as (select key, count(distinct contact_id)::int as contacts from seg group by key),
    ev as (
      select s.key,
        count(distinct ev.email_id || ':' || ev.contact_id) filter (where ev.type in ('sent','delivered'))::int as sent,
        count(distinct ev.email_id || ':' || ev.contact_id) filter (where ev.type = 'clicked')::int as clicks
      from email_events ev join seg s on s.contact_id = ev.contact_id
      where ev.location_id = ${locationId} and ev.email_id in (select id from e)
      group by s.key
    ),
    cv as (
      select s.key,
        count(*) filter (where a.conversion_type = 'appointment' and p.status <> 'cancelled')::int as booked,
        count(*) filter (where a.conversion_type = 'appointment' and p.status = 'showed')::int as showed,
        count(*) filter (where a.conversion_type = 'appointment' and p.status = 'noshow')::int as noshow,
        coalesce(sum(a.amount_cents) filter (where a.conversion_type = 'payment'), 0)::float8 as rev
      from attributions a join seg s on s.contact_id = a.contact_id
      left join appointments p on a.conversion_type = 'appointment' and p.location_id = a.location_id and p.id = a.conversion_id
      where a.location_id = ${locationId} and a.email_id in (select id from e)
      group by s.key
    )
    select cnt.key, cnt.contacts, coalesce(ev.sent,0) as sent, coalesce(ev.clicks,0) as clicks,
      coalesce(cv.booked,0) as booked, coalesce(cv.showed,0) as showed, coalesce(cv.noshow,0) as noshow, coalesce(cv.rev,0) as "revCents"
    from cnt left join ev on ev.key = cnt.key left join cv on cv.key = cnt.key
    where coalesce(ev.sent,0) > 0
  `);
}

/** Credited bookings in the trailing 7 days vs the 7 before; plus the email that drove most of this week's. */
export async function bookedWeekOverWeek(locationId: string) {
  const [r] = await rows<{ thisWeek: number; lastWeek: number; top: string | null }>(sql`
    with a as (
      select a.email_id, a.converted_at from attributions a
      join appointments p on p.location_id = a.location_id and p.id = a.conversion_id
      where a.location_id = ${locationId} and a.conversion_type = 'appointment' and a.email_id is not null and p.status <> 'cancelled'
        and a.converted_at >= now() - interval '14 days'
    )
    select
      count(*) filter (where converted_at >= now() - interval '7 days')::int as "thisWeek",
      count(*) filter (where converted_at < now() - interval '7 days')::int as "lastWeek",
      (select e.name from a join emails e on e.location_id = ${locationId} and e.id = a.email_id
        where a.converted_at >= now() - interval '7 days' group by e.name order by count(*) desc limit 1) as top
    from a
  `);
  return r;
}

/** Revenue by conversion day, from sends in the range (same cohort as the hero and funnel). */
export async function revenueByDay(locationId: string, days: number) {
  return rows<{ day: string; revCents: number }>(sql`
    select to_char(date_trunc('day', converted_at at time zone 'UTC'), 'YYYY-MM-DD') as day, sum(amount_cents)::float8 as "revCents"
    from attributions
    where location_id = ${locationId} and conversion_type = 'payment'
      and email_id in (select id from emails where location_id = ${locationId} and sent_at >= ${since(days)})
    group by 1 order by 1
  `);
}

export interface ContactListItem {
  id: string;
  name: string;
  emails: number;
  revCents: number;
  status: string;
}

export async function contactList(locationId: string, q: string, limit = 50): Promise<ContactListItem[]> {
  const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const filter = q
    ? sql`and (coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') ilike ${like} or c.email ilike ${like} or c.id = ${q})`
    : sql``;
  const r = await rows<{ id: string; first: string | null; last: string | null; email: string | null; emails: number; revCents: number; paid: boolean; noshow: boolean; showed: boolean; booked: boolean; clicked: boolean }>(sql`
    select c.id, c.first_name as first, c.last_name as last, c.email,
      (select count(distinct email_id) from email_events ev where ev.location_id = c.location_id and ev.contact_id = c.id and ev.type in ('sent','delivered'))::int as emails,
      coalesce((select sum(amount_cents) from payments p where p.location_id = c.location_id and p.contact_id = c.id), 0)::float8 as "revCents",
      exists(select 1 from payments p where p.location_id = c.location_id and p.contact_id = c.id and p.amount_cents > 0) as paid,
      exists(select 1 from appointments a where a.location_id = c.location_id and a.contact_id = c.id and a.status = 'noshow') as noshow,
      exists(select 1 from appointments a where a.location_id = c.location_id and a.contact_id = c.id and a.status = 'showed') as showed,
      exists(select 1 from appointments a where a.location_id = c.location_id and a.contact_id = c.id and a.status <> 'cancelled') as booked,
      exists(select 1 from email_events ev where ev.location_id = c.location_id and ev.contact_id = c.id and ev.type = 'clicked') as clicked
    from contacts c
    where c.location_id = ${locationId} ${filter}
    order by "revCents" desc, emails desc, c.id
    limit ${limit}
  `);
  return r.map((x) => ({
    id: x.id,
    name: displayName(x.first, x.last, x.email),
    emails: x.emails,
    revCents: x.revCents,
    status: x.paid ? "Paid" : x.noshow ? "No-show" : x.showed ? "Showed, no sale" : x.booked ? "Booked" : x.clicked ? "Clicked only" : "Emailed",
  }));
}

/** "Maria K." — first name + last initial; falls back to the email's local part. Keeps PII on screen minimal. */
export function displayName(first: string | null, last: string | null, email: string | null) {
  if (first) return last ? `${first} ${last[0]}.` : first;
  if (email) return email.split("@")[0];
  return "Unknown contact";
}

export interface JourneyRaw {
  contact: { id: string; first: string | null; last: string | null; email: string | null } | null;
  events: { kind: string; at: string; emailId: string | null; emailName: string | null; url: string | null; id: string; status?: string; amountCents?: number; title?: string | null; startAt?: string | null; description?: string | null; refundOf?: string | null }[];
  credits: { conversionType: string; conversionId: string; emailId: string | null; emailName: string | null; clickEventId: number | null; firstClickAt: string | null; convertedAt: string }[];
}

export async function journey(locationId: string, contactId: string): Promise<JourneyRaw> {
  const [contact] = await rows<JourneyRaw["contact"] & object>(sql`
    select id, first_name as first, last_name as last, email from contacts where location_id = ${locationId} and id = ${contactId}
  `);
  const events = await rows<JourneyRaw["events"][number]>(sql`
    select ev.type::text as kind, ev.occurred_at as at, ev.email_id as "emailId", e.name as "emailName", ev.url, ev.id::text as id,
      null::text as status, null::float8 as "amountCents", null::text as title, null::timestamptz as "startAt", null::text as description, null::text as "refundOf"
    from email_events ev left join emails e on e.location_id = ev.location_id and e.id = ev.email_id
    where ev.location_id = ${locationId} and ev.contact_id = ${contactId} and ev.type <> 'delivered'
    union all
    select 'appointment', booked_at, null, null, null, id, status::text, null, title, start_at, null, null
    from appointments where location_id = ${locationId} and contact_id = ${contactId}
    union all
    select 'payment', paid_at, null, null, null, id, null, amount_cents::float8, null, null, description, refund_of
    from payments where location_id = ${locationId} and contact_id = ${contactId}
    order by 2, 1
  `);
  const credits = await rows<JourneyRaw["credits"][number]>(sql`
    select a.conversion_type::text as "conversionType", a.conversion_id as "conversionId", a.email_id as "emailId", e.name as "emailName",
      a.click_event_id as "clickEventId", a.first_click_at as "firstClickAt", a.converted_at as "convertedAt"
    from attributions a left join emails e on e.location_id = a.location_id and e.id = a.email_id
    where a.location_id = ${locationId} and a.contact_id = ${contactId}
  `);
  return { contact: contact ?? null, events, credits };
}

export async function linkAudit(locationId: string) {
  return rows<{ id: string; name: string; sentAt: string; reason: string }>(sql`
    select e.id, e.name, e.sent_at as "sentAt",
      case when e.utm_campaign is null then 'No utm_campaign on any link'
           when e.needs_review then 'Created from an untagged event, review name and UTMs'
           else 'No tracked clicks yet' end as reason
    from emails e
    where e.location_id = ${locationId}
      and e.sent_at >= now() - interval '90 days'
      and (e.utm_campaign is null or e.needs_review
           or not exists (select 1 from email_events ev where ev.location_id = e.location_id and ev.email_id = e.id and ev.type = 'clicked'))
    order by e.sent_at desc limit 100
  `);
}
