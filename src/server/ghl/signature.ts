import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * Marketplace webhook signatures (VERIFY in GHL "Webhook Integration Guide"):
 *  - X-GHL-Signature: Ed25519 over the raw body (current).
 *  - X-WH-Signature: RSA-SHA256 over the raw body (legacy; deprecation announced for 2026).
 * Public keys come from env (paste the PEMs from the docs), so key rotation needs no deploy.
 */
export function verifyMarketplaceSignature(rawBody: string, headers: Headers, env: Record<string, string | undefined> = process.env): boolean {
  const ed = headers.get("x-ghl-signature");
  const edKey = env.GHL_WEBHOOK_ED25519_PUBLIC_KEY;
  if (ed && edKey) {
    try {
      return cryptoVerify(null, Buffer.from(rawBody), createPublicKey(pem(edKey)), Buffer.from(ed, "base64"));
    } catch {
      return false;
    }
  }
  const rsa = headers.get("x-wh-signature");
  const rsaKey = env.GHL_WEBHOOK_RSA_PUBLIC_KEY;
  if (rsa && rsaKey) {
    try {
      return cryptoVerify("sha256", Buffer.from(rawBody), createPublicKey(pem(rsaKey)), Buffer.from(rsa, "base64"));
    } catch {
      return false;
    }
  }
  return false;
}

const pem = (k: string) => k.replace(/\\n/g, "\n").trim();

