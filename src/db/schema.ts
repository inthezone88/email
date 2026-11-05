import {
  pgTable,
  text,
  integer,
  bigint,
  bigserial,
  timestamp,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * Multi-tenant: every business table carries `location_id` (a GHL sub-account id).
 * Natural ids from GHL are text; our own ids are text (nanoid-like) or bigserial.
 */

export const locationStatus = pgEnum("location_status", ["connected", "disconnected", "error", "demo"]);
export const emailEventType = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
]);
export const appointmentStatus = pgEnum("appointment_status", ["booked", "confirmed", "showed", "noshow", "cancelled"]);
export const opportunityStatus = pgEnum("opportunity_status", ["open", "won", "lost", "abandoned"]);
export const subjectStyle = pgEnum("subject_style", ["Question", "Number", "Urgency", "Plain"]);
export const attributionModel = pgEnum("attribution_model", ["last_click", "first_click"]);
export const conversionType = pgEnum("conversion_type", ["appointment", "payment"]);
export const alertSeverity = pgEnum("alert_severity", ["red", "amber", "green"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Auth ----------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const userLocations = pgTable(
  "user_locations",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"), // owner | viewer
  },
  (t) => [primaryKey({ columns: [t.userId, t.locationId] })],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------- Locations / settings ----------
export const locations = pgTable("locations", {
  id: text("id").primaryKey(), // GHL locationId
  name: text("name").notNull(),
  companyId: text("company_id"),
  status: locationStatus("status").notNull().default("disconnected"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  tokenExpiresAt: ts("token_expires_at"),
  scopes: text("scopes"),
  lastSyncedAt: ts("last_synced_at"),
  lastSyncError: text("last_sync_error"),
  backfilledAt: ts("backfilled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  locationId: text("location_id")
    .primaryKey()
    .references(() => locations.id, { onDelete: "cascade" }),
  windowDays: integer("window_days").notNull().default(14),
  model: attributionModel("model").notNull().default("last_click"),
  reattributing: boolean("reattributing").notNull().default(false),
  attributedAt: ts("attributed_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- CRM ----------
export const contacts = pgTable(
  "contacts",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    source: text("source"),
    tags: text("tags").array().notNull().default([]),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] })],
);

// ---------- Email ----------
export const campaigns = pgTable(
  "campaigns",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    ghlRef: text("ghl_ref"),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] })],
);

export const sequences = pgTable(
  "sequences",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(), // GHL workflow id
    name: text("name").notNull(),
    note: text("note"), // e.g. "Triggered on opt-in"
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] })],
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    sequenceId: text("sequence_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    name: text("name").notNull(),
    delayLabel: text("delay_label"), // "Day 2"
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] })],
);

/** One email send (a campaign blast, or one step of a sequence). */
export const emails = pgTable(
  "emails",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    campaignId: text("campaign_id"),
    sequenceStepId: text("sequence_step_id"),
    name: text("name").notNull(),
    subject: text("subject"),
    subjectStyle: subjectStyle("subject_style").notNull().default("Plain"),
    subjectStyleOverride: subjectStyle("subject_style_override"),
    fromAddress: text("from_address"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    ghlRef: text("ghl_ref"), // GHL message / campaign / workflow-action id
    needsReview: boolean("needs_review").notNull().default(false),
    sentAt: ts("sent_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.id] }),
    index("emails_loc_sent_idx").on(t.locationId, t.sentAt),
    index("emails_loc_utm_idx").on(t.locationId, t.utmCampaign, t.utmContent),
    index("emails_loc_ghlref_idx").on(t.locationId, t.ghlRef),
  ],
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    contactId: text("contact_id").notNull(),
    type: emailEventType("type").notNull(),
    occurredAt: ts("occurred_at").notNull(),
    url: text("url"),
    source: text("source").notNull(), // redirect | ghl_webhook | workflow | backfill | seed
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    uniqueIndex("email_events_dedupe_idx").on(t.locationId, t.dedupeKey),
    index("email_events_email_idx").on(t.locationId, t.emailId, t.type),
    index("email_events_contact_idx").on(t.locationId, t.contactId, t.occurredAt),
  ],
);

/** Links routed through /r/<id> for reliable per-contact click data. */
export const trackedLinks = pgTable(
  "tracked_links",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    emailId: text("email_id").notNull(),
    destination: text("destination").notNull(), // already UTM-tagged
    label: text("label"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tracked_links_email_idx").on(t.locationId, t.emailId)],
);

// ---------- Conversions ----------
export const appointments = pgTable(
  "appointments",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    contactId: text("contact_id").notNull(),
    calendarId: text("calendar_id"),
    title: text("title"),
    status: appointmentStatus("status").notNull().default("booked"),
    bookedAt: ts("booked_at").notNull(),
    startAt: ts("start_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] }), index("appointments_contact_idx").on(t.locationId, t.contactId)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    contactId: text("contact_id"),
    name: text("name"),
    valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
    status: opportunityStatus("status").notNull().default("open"),
    pipelineId: text("pipeline_id"),
    stage: text("stage"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] })],
);

/** Revenue source of truth. Refunds are stored as negative amounts with refundOf set. */
export const payments = pgTable(
  "payments",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    contactId: text("contact_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    refundOf: text("refund_of"),
    description: text("description"),
    paidAt: ts("paid_at").notNull(),
    source: text("source"),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.id] }), index("payments_contact_idx").on(t.locationId, t.contactId)],
);

/** One row per conversion: which email (if any) gets the credit. Rebuilt when settings change. */
export const attributions = pgTable(
  "attributions",
  {
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    conversionType: conversionType("conversion_type").notNull(),
    conversionId: text("conversion_id").notNull(),
    contactId: text("contact_id").notNull(),
    emailId: text("email_id"), // null = unattributed
    clickEventId: bigint("click_event_id", { mode: "number" }),
    clickAt: ts("click_at"),
    firstClickAt: ts("first_click_at"), // contact's first click on the credited email (for days-to-book)
    convertedAt: ts("converted_at").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    model: attributionModel("model").notNull(),
    windowDays: integer("window_days").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.conversionType, t.conversionId] }),
    index("attributions_email_idx").on(t.locationId, t.emailId),
  ],
);

// ---------- Ops ----------
export const alerts = pgTable(
  "alerts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    locationId: text("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    severity: alertSeverity("severity").notNull(),
    text: text("text").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
    notifiedAt: ts("notified_at"),
  },
  (t) => [uniqueIndex("alerts_fp_idx").on(t.locationId, t.fingerprint)],
);

export const webhookReceipts = pgTable("webhook_receipts", {
  id: text("id").primaryKey(), // provider webhook id or body hash
  locationId: text("location_id"),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  locationId: text("location_id").notNull(),
  kind: text("kind").notNull(), // backfill | reconcile | token_refresh
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  ok: boolean("ok"),
  stats: jsonb("stats"),
  error: text("error"),
});
