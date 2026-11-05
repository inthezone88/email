import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { recordEmailEvent } from "@/server/ingest";
import { attributeContacts } from "@/server/attribution";
import { clientIp, rateLimit } from "@/server/http";

/**
 * Click redirect: /r/<linkId>?c={{contact.id}}
 * Logs a per-contact click, then 302s to the UTM-tagged destination. Never blocks the redirect on logging.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await db.query.trackedLinks.findFirst({ where: eq(schema.trackedLinks.id, id) });
  if (!link) return new NextResponse("Link not found", { status: 404 });
  const contactId = new URL(req.url).searchParams.get("c");
  const looksReal = contactId && /^[A-Za-z0-9_-]{6,64}$/.test(contactId); // skip unrendered "{{contact.id}}"
  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /bot|crawler|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda/i.test(ua);
  if (looksReal && !isBot && rateLimit("r:" + clientIp(req), 120, 60_000)) {
    after(async () => {
      const at = new Date();
      const inserted = await recordEmailEvent({
        locationId: link.locationId,
        emailId: link.emailId,
        contactId: contactId!,
        type: "clicked",
        occurredAt: at,
        url: link.destination,
        source: "redirect",
        // One click per contact per link per minute: link scanners and double-taps don't inflate counts.
        dedupeKey: `r:${link.id}:${contactId}:${Math.floor(at.getTime() / 60_000)}`,
      });
      if (inserted) await attributeContacts(link.locationId, [contactId!]);
    });
  }
  return NextResponse.redirect(link.destination, 302);
}
