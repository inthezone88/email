import { NextResponse } from "next/server";
import { claimDelivery, deliveryId, handleEvent } from "@/server/ghl/webhooks";
import { safeEqual } from "@/server/crypto";
import { clientIp, rateLimit } from "@/server/http";

/**
 * Target for a GHL workflow "Webhook" action (e.g. trigger: Email Events, Appointment Status, Payment Received).
 * GHL workflow webhooks are not signed, so authenticate with a shared secret in a custom header
 * `x-webhook-secret` (or `?secret=` if your plan can't set headers).
 * Body: the standard workflow payload plus custom data, e.g.
 *   { "event": "{{email.event}}", "location_id": "{{location.id}}", "contact_id": "{{contact.id}}",
 *     "url": "{{email.clicked_url}}", "subject": "{{email.subject}}", "timestamp": "{{right_now}}" }
 * VERIFY the merge-field names in your GHL workflow builder.
 */
export async function POST(req: Request) {
  if (!rateLimit("wf:" + clientIp(req), 600, 60_000)) return new NextResponse(null, { status: 429 });
  const secret = process.env.WEBHOOK_SECRET;
  const given = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  // Workflow payloads put custom fields under customData; flatten so the normaliser sees them.
  const custom = (body.customData ?? {}) as Record<string, unknown>;
  const loc = (custom.location_id ?? body.location_id ?? (body.location as { id?: string })?.id) as string | undefined;
  const merged = { ...body, ...custom, locationId: loc, contactId: custom.contact_id ?? body.contact_id };
  if (!(await claimDelivery(deliveryId(merged, raw), loc ?? null))) return NextResponse.json({ ok: true, duplicate: true });
  try {
    return NextResponse.json({ ok: true, status: await handleEvent(merged) });
  } catch (e) {
    console.error("[webhook:workflow] failed:", e instanceof Error ? e.message : "error");
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
