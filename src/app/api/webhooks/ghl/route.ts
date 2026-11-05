import { NextResponse } from "next/server";
import { claimDelivery, deliveryId, handleEvent, verifyMarketplaceSignature } from "@/server/ghl/webhooks";
import { disconnect } from "@/server/ghl/client";
import { clientIp, rateLimit } from "@/server/http";

/** GHL Marketplace app webhooks. Signature-verified, idempotent. */
export async function POST(req: Request) {
  if (!rateLimit("wh:" + clientIp(req), 600, 60_000)) return new NextResponse(null, { status: 429 });
  const raw = await req.text();
  if (!verifyMarketplaceSignature(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const loc = (body.locationId as string) ?? null;
  if (!(await claimDelivery(deliveryId(body, raw), loc))) return NextResponse.json({ ok: true, duplicate: true });
  if (body.type === "UNINSTALL" && loc) {
    await disconnect(loc);
    return NextResponse.json({ ok: true });
  }
  try {
    const status = await handleEvent(body);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    console.error("[webhook:ghl] failed:", body.type, e instanceof Error ? e.message : "error");
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // GHL retries
  }
}
