/**
 * Seeds a "Demo" sub-account with synthetic but internally consistent data modelled on the
 * prototype (same campaign names and rates). Everything flows through the real pipeline:
 * raw events → attribution engine → report queries. Re-runnable: wipes the demo location first.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema, closeDb } from "../src/db";
import { classifySubject } from "../src/lib/subject";
import { rebuildAttributions } from "../src/server/attribution";
import { runAlerts } from "../src/server/alerts";

const LOC = "demo";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.now();

// Deterministic PRNG so the demo looks the same every time.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
function sample<T>(arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = 0; i < Math.min(n, a.length); i++) {
    const j = i + Math.floor(rnd() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const FIRST = ["Maria", "Dev", "Tom", "Priya", "Sam", "Alex", "Jordan", "Lena", "Omar", "Grace", "Kenji", "Ava", "Noah", "Zoe", "Luis", "Hana", "Ben", "Chloe", "Ravi", "Ivy", "Marcus", "Nina", "Owen", "Sofia", "Theo", "Uma", "Victor", "Wen", "Yara", "Zack"];
const LAST = "ABCDEFGHIJKLMNOPRSTVWY".split("");
const TAGS = ["Warm leads", "Webinar attendees", "Cold outbound replies", "Past clients", "Newsletter only"];
const TAG_W = [0.25, 0.12, 0.2, 0.06, 0.37];
const SOURCES = ["Facebook ads", "Referral", "Podcast", "Google ads", "Cold email"];
const SRC_W = [0.33, 0.07, 0.14, 0.18, 0.28];
const SENDERS = ["you@company.com", "team@company.com", "support@company.com"];
const weighted = (items: string[], w: number[]) => {
  let r = rnd();
  for (let i = 0; i < items.length; i++) if ((r -= w[i]) <= 0) return items[i];
  return items[items.length - 1];
};

// [name, daysAgo, sent, openRate, clickRate, clickToBook, sales, revenue, sender]
const CAMPAIGNS: [string, number, number, number, number, number, number, number, number][] = [
  ["Free audit invite", 5, 4200, 0.46, 0.071, 0.11, 5, 9500, 0],
  ["Case study: 3x leads", 15, 3900, 0.41, 0.052, 0.07, 3, 6000, 0],
  ["Last call: strategy slots", 22, 3600, 0.38, 0.084, 0.13, 6, 12000, 0],
  ["Webinar replay", 29, 2800, 0.52, 0.039, 0.05, 1, 1500, 1],
  ["Weekly newsletter #42", 33, 5100, 0.55, 0.026, 0.02, 0, 0, 1],
  ["Black Friday teaser: are you ready?", 36, 4800, 0.49, 0.061, 0.09, 4, 7200, 0],
  ["Onboarding: day 1", 40, 1900, 0.72, 0.118, 0.16, 2, 3000, 2],
  ["Reactivation: we miss you?", 44, 3300, 0.29, 0.033, 0.04, 1, 1800, 1],
  ["Client win: 40 leads for Dr. Patel", 49, 3700, 0.44, 0.067, 0.12, 5, 8500, 0],
  ["Weekly newsletter #41", 54, 5000, 0.57, 0.024, 0.01, 0, 0, 1],
  ["Offer: 30-day sprint ends Friday", 58, 4100, 0.4, 0.079, 0.1, 4, 8000, 0],
  ["Podcast episode drop: what works?", 64, 3000, 0.6, 0.045, 0.03, 0, 0, 2],
];

// [sequence, note, steps: [name, day, sent, clickRate, booked, show, revenue, sales]]
const SEQUENCES: [string, string, [string, number, number, number, number, number, number, number][]][] = [
  ["Welcome → audit booking", "Triggered on opt-in", [["Welcome + what to expect", 0, 2400, 0.081, 14, 0.64, 2000, 1], ["Client story", 2, 2310, 0.057, 9, 0.62, 3000, 2], ["Free audit offer", 4, 2240, 0.112, 41, 0.71, 17500, 9], ["Objection: price", 6, 2150, 0.049, 10, 0.6, 4000, 2], ["Last chance", 9, 2080, 0.088, 17, 0.66, 2200, 1]]],
  ["Webinar follow-up", "Triggered on registration", [["Confirmation", 0, 1500, 0.21, 6, 0.5, 1000, 1], ["Reminder: 1 hour", 1, 1450, 0.26, 12, 0.55, 3500, 2], ["Replay", 2, 1380, 0.071, 7, 0.49, 1500, 1], ["Offer: sprint", 3, 1330, 0.094, 15, 0.62, 7000, 4]]],
  ["Reactivation", "Triggered after 90 days inactive", [["We miss you", 0, 3300, 0.033, 4, 0.5, 1800, 1], ["What changed", 3, 2900, 0.028, 2, 0.5, 0, 0], ["Final goodbye", 7, 2700, 0.041, 5, 0.6, 1900, 1]]],
];

type Ev = typeof schema.emailEvents.$inferInsert;
const events: Ev[] = [];
const appts: (typeof schema.appointments.$inferInsert)[] = [];
const pays: (typeof schema.payments.$inferInsert)[] = [];
let evN = 0;
const ev = (emailId: string, contactId: string, type: Ev["type"], at: number, url?: string) =>
  events.push({ locationId: LOC, emailId, contactId, type, occurredAt: new Date(at), url: url ?? null, source: "seed", dedupeKey: `seed:${evN++}` });

async function main() {
  await db.delete(schema.locations).where(eq(schema.locations.id, LOC));
  await db.insert(schema.locations).values({ id: LOC, name: "Demo", status: "demo", lastSyncedAt: new Date() });
  await db.insert(schema.settings).values({ locationId: LOC, windowDays: 14, model: "last_click" });

  // Admins (from ADMIN_EMAILS) can see the demo.
  for (const email of (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    await db.insert(schema.users).values({ id: "u_" + email.replace(/[^a-z0-9]/g, "").slice(0, 20), email, isAdmin: true }).onConflictDoUpdate({ target: schema.users.email, set: { isAdmin: true } });
  }

  // Contacts
  const N = 9000;
  const contacts = Array.from({ length: N }, (_, i) => ({
    locationId: LOC,
    id: `ct_${String(i).padStart(5, "0")}`,
    firstName: FIRST[i % FIRST.length],
    lastName: LAST[Math.floor(i / FIRST.length) % LAST.length],
    email: `demo+${i}@example.com`,
    source: weighted(SOURCES, SRC_W),
    tags: [weighted(TAGS, TAG_W)],
    createdAt: new Date(now - (100 + rnd() * 300) * DAY),
  }));
  // Named demo contacts from the prototype.
  Object.assign(contacts[0], { firstName: "Maria", lastName: "K", tags: ["Warm leads"], source: "Facebook ads" });
  Object.assign(contacts[1], { firstName: "Dev", lastName: "R", tags: ["Warm leads"], source: "Google ads" });
  Object.assign(contacts[2], { firstName: "Tom", lastName: "H", tags: ["Webinar attendees"], source: "Podcast" });
  Object.assign(contacts[3], { firstName: "Priya", lastName: "S", tags: ["Past clients"], source: "Referral" });
  for (let i = 0; i < contacts.length; i += 1000) await db.insert(schema.contacts).values(contacts.slice(i, i + 1000));
  const ids = contacts.map((c) => c.id);
  const reserved = new Set(ids.slice(0, 4));
  const pool = ids.filter((id) => !reserved.has(id));

  const conversions = (emailId: string, slug: string, sentAt: number, clickers: string[], booked: number, show: number, sales: number, rev: number, bounceRate: number, spamRate: number, unsubRate: number, recips: string[]) => {
    // deliverability
    for (const c of sample(recips, Math.round(recips.length * bounceRate))) ev(emailId, c, "bounced", sentAt + 60_000);
    for (const c of sample(recips, Math.round(recips.length * spamRate))) ev(emailId, c, "complained", sentAt + 5 * HOUR);
    for (const c of sample(recips, Math.round(recips.length * unsubRate))) ev(emailId, c, "unsubscribed", sentAt + 3 * HOUR);
    // bookings from clickers
    const bookers = sample(clickers, booked);
    const showers: { c: string; at: number }[] = [];
    bookers.forEach((c, k) => {
      const clickAt = events.find((e) => e.emailId === emailId && e.contactId === c && e.type === "clicked")!.occurredAt!.getTime();
      const bookedAt = clickAt + (0.1 + rnd() * 4.5) * DAY;
      const startAt = bookedAt + (1 + rnd() * 3) * DAY;
      const r = rnd();
      const status = r < show ? "showed" : r < show + 0.04 ? "cancelled" : "noshow";
      if (startAt > now && status !== "cancelled") {
        appts.push({ locationId: LOC, id: `ap_${emailId}_${k}`, contactId: c, title: "Strategy call", status: "booked", bookedAt: new Date(bookedAt), startAt: new Date(startAt) });
        return;
      }
      appts.push({ locationId: LOC, id: `ap_${emailId}_${k}`, contactId: c, title: "Strategy call", status: status as "showed", bookedAt: new Date(bookedAt), startAt: new Date(startAt) });
      if (status === "showed") showers.push({ c, at: startAt });
    });
    // sales from showers (fallback to clickers when the funnel is too thin)
    const buyers = showers.slice(0, sales);
    while (buyers.length < sales) {
      const c = pick(clickers);
      const clickAt = events.find((e) => e.emailId === emailId && e.contactId === c && e.type === "clicked")!.occurredAt!.getTime();
      buyers.push({ c, at: clickAt + 2 * DAY });
    }
    buyers.forEach((b, k) => {
      const amt = Math.round((rev / sales) * 100);
      const paidAt = Math.min(now - HOUR, b.at + (0.5 + rnd() * 2) * DAY);
      pays.push({ locationId: LOC, id: `pay_${emailId}_${k}`, contactId: b.c, amountCents: amt, description: amt >= 300000 ? "30-day sprint" : "Strategy package", paidAt: new Date(paidAt), source: "seed" });
    });
    void slug;
  };

  // Campaigns
  const emailRows: (typeof schema.emails.$inferInsert)[] = [];
  CAMPAIGNS.forEach(([name, daysAgo, sent, open, ctr, c2b, sales, rev, sender], i) => {
    const id = `em_c${i}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const sentAt = now - daysAgo * DAY;
    emailRows.push({ locationId: LOC, id, campaignId: null, name, subject: name, subjectStyle: classifySubject(name), fromAddress: SENDERS[sender], utmCampaign: slug, utmContent: id, sentAt: new Date(sentAt) });
    const recips = sample(pool, sent);
    for (const c of recips) ev(id, c, "sent", sentAt);
    const openers = sample(recips, Math.round(sent * open));
    for (const c of openers) ev(id, c, "opened", sentAt + rnd() * 30 * HOUR);
    const clickers = sample(openers, Math.round(sent * ctr));
    for (const c of clickers) ev(id, c, "clicked", sentAt + (0.2 + rnd() * 36) * HOUR, `https://company.com/book?utm_source=ghl&utm_medium=email&utm_campaign=${slug}&utm_content=${id}`);
    const bounce = i === 7 ? 0.031 : 0.004 + (i % 5) * 0.004;
    const spam = i === 7 ? 0.0014 : 0.0003 + (i % 4) * 0.0004;
    const unsub = 0.002 + (i % 3) * 0.002;
    conversions(id, slug, sentAt, clickers, Math.round(clickers.length * c2b), 0.6 + (i % 4) * 0.07, sales, rev, bounce, spam, unsub, recips);
  });

  // Sequences
  for (const [si, [sname, note, steps]] of SEQUENCES.entries()) {
    const seqId = `seq_${si}`;
    await db.insert(schema.sequences).values({ locationId: LOC, id: seqId, name: sname, note });
    const start = now - 45 * DAY;
    for (const [k, [name, day, sent, ctr, booked, show, rev, sales]] of steps.entries()) {
      const stepId = `${seqId}_s${k + 1}`;
      await db.insert(schema.sequenceSteps).values({ locationId: LOC, id: stepId, sequenceId: seqId, stepOrder: k + 1, name, delayLabel: `Day ${day}` });
      const id = `em_${stepId}`;
      const sentAt = start + day * DAY;
      const slug = sname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      emailRows.push({ locationId: LOC, id, sequenceStepId: stepId, name: `${sname}: ${name}`, subject: name, subjectStyle: classifySubject(name), fromAddress: SENDERS[si === 2 ? 1 : 0], utmCampaign: slug, utmContent: stepId, sentAt: new Date(sentAt) });
      const recips = sample(pool, sent);
      for (const c of recips) ev(id, c, "sent", sentAt);
      const clickers = sample(recips, Math.max(booked, Math.round(sent * ctr)));
      for (const c of clickers) {
        ev(id, c, "opened", sentAt + rnd() * 10 * HOUR);
        ev(id, c, "clicked", sentAt + (0.2 + rnd() * 30) * HOUR, `https://company.com/book?utm_source=ghl&utm_medium=email&utm_campaign=${slug}&utm_content=${stepId}`);
      }
      for (const c of sample(recips, Math.round(sent * 0.35))) ev(id, c, "opened", sentAt + rnd() * 30 * HOUR);
      conversions(id, slug, sentAt, clickers, booked, show, sales, rev, 0.006, 0.0003, 0.003, recips);
    }
  }

  // Hand-written journeys for the four named contacts (mirrors the prototype's Journeys tab).
  const [maria, dev, tom, priya] = ids;
  const t = (d: number, h = 9) => now - d * DAY + h * HOUR; // audit invite went out 5 days ago
  const audit = "em_c0", lastCall = "em_c2", webinar = "em_c3", sprint = "em_c10", welcome = "em_seq_0_s1", story = "em_seq_0_s2";
  ev(welcome, maria, "sent", t(12)); ev(welcome, maria, "opened", t(12, 9.1));
  ev(story, maria, "sent", t(10));
  ev(audit, maria, "sent", t(5)); ev(audit, maria, "opened", t(5, 9.01));
  ev(audit, maria, "clicked", t(5, 9.03), "https://company.com/book?utm_source=ghl&utm_medium=email&utm_campaign=free-audit-invite&utm_content=em_c0");
  appts.push({ locationId: LOC, id: "ap_maria", contactId: maria, title: "Audit call", status: "showed", bookedAt: new Date(t(5, 9.25)), startAt: new Date(t(3, 14)) });
  pays.push({ locationId: LOC, id: "pay_maria", contactId: maria, amountCents: 200000, description: "Strategy package", paidAt: new Date(t(1, 11.3)), source: "seed" });

  ev(lastCall, dev, "sent", t(7)); ev(lastCall, dev, "opened", t(7, 9.01));
  ev(lastCall, dev, "clicked", t(7, 9.05), "https://company.com/book?utm_source=ghl&utm_medium=email&utm_campaign=last-call-strategy-slots&utm_content=em_c2");
  appts.push({ locationId: LOC, id: "ap_dev", contactId: dev, title: "Strategy call", status: "noshow", bookedAt: new Date(t(7, 9.15)), startAt: new Date(t(4, 10)) });

  ev(webinar, tom, "sent", t(9)); ev(webinar, tom, "opened", t(9, 12));
  ev(webinar, tom, "clicked", t(9, 20.7), "https://company.com/replay?utm_source=ghl&utm_medium=email&utm_campaign=webinar-replay&utm_content=em_c3");
  ev(sprint, tom, "sent", t(2)); ev(sprint, tom, "opened", t(2, 10));

  ev(welcome, priya, "sent", t(20)); ev(welcome, priya, "clicked", t(20, 9.5), "https://company.com/?utm_source=ghl&utm_medium=email&utm_campaign=welcome-audit-booking&utm_content=seq_0_s1");
  ev(story, priya, "sent", t(16)); ev(story, priya, "clicked", t(16, 9.5), "https://company.com/story?utm_source=ghl&utm_medium=email&utm_campaign=welcome-audit-booking&utm_content=seq_0_s2");
  ev(audit, priya, "sent", t(5)); ev(audit, priya, "clicked", t(5, 10), "https://company.com/book?utm_source=ghl&utm_medium=email&utm_campaign=free-audit-invite&utm_content=em_c0");
  ev(sprint, priya, "sent", t(4)); ev(sprint, priya, "clicked", t(4, 9.2), "https://company.com/sprint?utm_source=ghl&utm_medium=email&utm_campaign=offer-30-day-sprint-ends-friday&utm_content=em_c10");
  appts.push({ locationId: LOC, id: "ap_priya", contactId: priya, title: "Strategy call", status: "showed", bookedAt: new Date(t(4, 9.5)), startAt: new Date(t(2, 13)) });
  pays.push({ locationId: LOC, id: "pay_priya", contactId: priya, amountCents: 400000, description: "30-day sprint", paidAt: new Date(t(1, 10)), source: "seed" });

  // A refund, and some conversions with no email click (tracking gaps).
  const firstPay = pays.find((p) => p.id.startsWith("pay_em_c2_"));
  if (firstPay) pays.push({ locationId: LOC, id: firstPay.id + ":refund", contactId: firstPay.contactId, amountCents: -Math.round(firstPay.amountCents / 2), refundOf: firstPay.id, description: "Partial refund", paidAt: new Date(firstPay.paidAt.getTime() + 3 * DAY), source: "seed" });
  for (let k = 0; k < 14; k++) {
    const c = pick(pool);
    const at = now - (1 + rnd() * 80) * DAY;
    appts.push({ locationId: LOC, id: `ap_direct_${k}`, contactId: c, title: "Strategy call", status: rnd() < 0.7 ? "showed" : "noshow", bookedAt: new Date(at), startAt: new Date(at + DAY) });
    if (k % 3 === 0) pays.push({ locationId: LOC, id: `pay_direct_${k}`, contactId: c, amountCents: 150000, description: "Strategy package", paidAt: new Date(at + 2 * DAY), source: "seed" });
  }

  await db.insert(schema.emails).values(emailRows);
  for (let i = 0; i < events.length; i += 2000) await db.insert(schema.emailEvents).values(events.slice(i, i + 2000));
  for (let i = 0; i < appts.length; i += 1000) await db.insert(schema.appointments).values(appts.slice(i, i + 1000));
  for (let i = 0; i < pays.length; i += 1000) await db.insert(schema.payments).values(pays.slice(i, i + 1000));

  const a = await rebuildAttributions(LOC);
  const alerts = await runAlerts(LOC);
  console.log(`Demo seeded: ${contacts.length} contacts, ${emailRows.length} sends, ${events.length} events, ${appts.length} appointments, ${pays.length} payments. Attributed ${a.conversions - a.unattributed}/${a.conversions}; ${alerts} alerts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
