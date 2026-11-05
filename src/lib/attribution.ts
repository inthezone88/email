/**
 * Attribution engine (pure). Given clicks and conversions for one location, decide which
 * email gets credit for each conversion.
 *
 * Rules (README "Attribution Model"):
 *  - Only email *clicks* count. Opens are never used.
 *  - A click qualifies if it belongs to the same contact, happened at or before the conversion,
 *    and no more than `windowDays` before it.
 *  - last_click → latest qualifying click; first_click → earliest qualifying click.
 *  - No qualifying click → unattributed (emailId = null).
 *  - Refunds (negative payments with refundOf) inherit the credit of the payment they refund,
 *    so revenue nets out on the same email. A refund whose original is unknown is attributed
 *    on its own timestamp like any other conversion.
 */

export type AttributionModel = "last_click" | "first_click";

export interface Click {
  id: number;
  contactId: string;
  emailId: string;
  at: Date;
}

export interface Conversion {
  type: "appointment" | "payment";
  id: string;
  contactId: string;
  at: Date;
  amountCents?: number;
  refundOf?: string | null;
}

export interface AttributionSettings {
  windowDays: number;
  model: AttributionModel;
}

export interface Attribution {
  conversionType: Conversion["type"];
  conversionId: string;
  contactId: string;
  emailId: string | null;
  clickEventId: number | null;
  clickAt: Date | null;
  /** The contact's first click on the credited email (any time before conversion). Used for "days to book". */
  firstClickAt: Date | null;
  convertedAt: Date;
  amountCents: number;
  model: AttributionModel;
  windowDays: number;
}

const DAY = 86_400_000;

export function attribute(clicks: Click[], conversions: Conversion[], s: AttributionSettings): Attribution[] {
  const byContact = new Map<string, Click[]>();
  for (const c of clicks) {
    const arr = byContact.get(c.contactId);
    if (arr) arr.push(c);
    else byContact.set(c.contactId, [c]);
  }
  for (const arr of byContact.values()) arr.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);

  const windowMs = s.windowDays * DAY;
  const pick = (conv: Conversion): Click | null => {
    const list = byContact.get(conv.contactId);
    if (!list) return null;
    const t = conv.at.getTime();
    let chosen: Click | null = null;
    for (const c of list) {
      const ct = c.at.getTime();
      if (ct > t) break;
      if (t - ct > windowMs) continue;
      if (s.model === "first_click") return c;
      chosen = c; // keep walking: last qualifying wins
    }
    return chosen;
  };
  const firstClickOn = (contactId: string, emailId: string, before: Date): Date | null => {
    const list = byContact.get(contactId) ?? [];
    const c = list.find((x) => x.emailId === emailId && x.at.getTime() <= before.getTime());
    return c ? c.at : null;
  };

  const out = new Map<string, Attribution>();
  const key = (c: { type: string; id: string }) => `${c.type}:${c.id}`;
  const build = (conv: Conversion, click: Click | null): Attribution => ({
    conversionType: conv.type,
    conversionId: conv.id,
    contactId: conv.contactId,
    emailId: click?.emailId ?? null,
    clickEventId: click?.id ?? null,
    clickAt: click?.at ?? null,
    firstClickAt: click ? firstClickOn(conv.contactId, click.emailId, conv.at) : null,
    convertedAt: conv.at,
    amountCents: conv.amountCents ?? 0,
    model: s.model,
    windowDays: s.windowDays,
  });

  // Pass 1: everything except refunds that point at a known payment.
  const paymentIds = new Set(conversions.filter((c) => c.type === "payment").map((c) => c.id));
  const deferred: Conversion[] = [];
  for (const conv of conversions) {
    if (conv.type === "payment" && conv.refundOf && paymentIds.has(conv.refundOf)) {
      deferred.push(conv);
      continue;
    }
    out.set(key(conv), build(conv, pick(conv)));
  }
  // Pass 2: refunds inherit the original payment's credit.
  for (const conv of deferred) {
    const orig = out.get(`payment:${conv.refundOf}`)!;
    out.set(key(conv), {
      ...build(conv, null),
      emailId: orig.emailId,
      clickEventId: orig.clickEventId,
      clickAt: orig.clickAt,
      firstClickAt: orig.firstClickAt,
    });
  }
  return [...out.values()];
}
