/** Pure mapping helpers for GHL payloads (unit-testable, no server imports). */

export type ApptStatus = "booked" | "confirmed" | "showed" | "noshow" | "cancelled";

export function mapAppointmentStatus(s: string | undefined | null): ApptStatus {
  switch ((s ?? "").toLowerCase().replace(/[^a-z]/g, "")) {
    case "showed":
    case "show":
    case "completed":
      return "showed";
    case "noshow":
      return "noshow";
    case "cancelled":
    case "canceled":
    case "invalid":
      return "cancelled";
    case "confirmed":
      return "confirmed";
    default:
      return "booked";
  }
}

export function mapOpportunityStatus(s: string | undefined | null): "open" | "won" | "lost" | "abandoned" {
  const v = (s ?? "").toLowerCase();
  return v === "won" || v === "lost" || v === "abandoned" ? v : "open";
}

/** GHL amounts are in major units (dollars). */
export function toCents(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return isFinite(n) ? Math.round(n * 100) : 0;
}

export type NormalizedEmailEvent = {
  type: "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "unsubscribed";
  contactId: string | null;
  at: Date;
  url: string | null;
  messageId: string | null;
  campaignRef: string | null;
  subject: string | null;
  fromAddress: string | null;
  emailId: string | null;
};

const TYPE_MAP: Record<string, NormalizedEmailEvent["type"]> = {
  sent: "sent",
  accepted: "sent",
  processed: "sent",
  delivered: "delivered",
  open: "opened",
  opened: "opened",
  click: "clicked",
  clicked: "clicked",
  bounce: "bounced",
  bounced: "bounced",
  failed: "bounced",
  permanent_fail: "bounced",
  complaint: "complained",
  complained: "complained",
  spam: "complained",
  unsubscribe: "unsubscribed",
  unsubscribed: "unsubscribed",
};

/**
 * Accepts the shapes we expect from (a) GHL marketplace "LCEmailStats" webhooks and
 * (b) a workflow "Email Events" trigger → Webhook action with custom fields.
 * VERIFY the exact LCEmailStats field names against GHL docs; we read several aliases.
 */
export function normalizeEmailEvent(b: Record<string, unknown>): NormalizedEmailEvent | null {
  const str = (...keys: string[]) => {
    for (const k of keys) {
      const v = k.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined), b);
      if (typeof v === "string" && v) return v;
    }
    return null;
  };
  const rawType = (str("event", "eventType", "email_event", "emailEvent", "type", "webhookPayload.event") ?? "").toLowerCase();
  const type = TYPE_MAP[rawType];
  if (!type) return null;
  const ts = str("timestamp", "occurredAt", "dateAdded", "date", "webhookPayload.timestamp");
  const tsNum = ts && /^\d+$/.test(ts) ? Number(ts) * (ts.length <= 10 ? 1000 : 1) : null;
  const at = tsNum ? new Date(tsNum) : ts ? new Date(ts) : new Date();
  return {
    type,
    contactId: str("contactId", "contact_id", "contact.id", "webhookPayload.contactId"),
    at: isNaN(at.getTime()) ? new Date() : at,
    url: str("url", "link", "clickedUrl", "webhookPayload.url"),
    messageId: str("messageId", "message_id", "emailMessageId", "webhookPayload.message-id", "webhookPayload.messageId"),
    campaignRef: str("campaignId", "campaign_id", "bulkActionId", "workflowId", "workflow.id"),
    subject: str("subject", "email_subject", "webhookPayload.subject"),
    fromAddress: str("from", "fromAddress", "from_address", "webhookPayload.from"),
    emailId: str("email_id", "emailId"),
  };
}
