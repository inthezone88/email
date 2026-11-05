/** UTM helpers shared by the link tagger UI and the server. */
export function buildTaggedUrl(dest: string, p: { campaign: string; content?: string }) {
  const u = new URL(dest);
  u.searchParams.set("utm_source", "ghl");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", p.campaign);
  if (p.content) u.searchParams.set("utm_content", p.content);
  return u.toString();
}

export const UTM_TEMPLATE = "?utm_source=ghl&utm_medium=email&utm_campaign={campaign-slug}&utm_content={email-or-step-id}";
