/**
 * Server-side HMAC used to one-way-hash emails and IPs before they touch
 * the database. The key is loaded once at boot from SERVER_HMAC_KEY and
 * never rotates (rotating it invalidates every stored hash, so it would
 * lock every user out).
 *
 * The HMAC also serves as the OPAQUE `credential_identifier`, which means
 * the server never sees the cleartext email at any point in the protocol.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacEmail(email: string, key: Buffer): Buffer {
  const normalized = email.trim().toLowerCase();
  return createHmac("sha256", key).update(normalized, "utf8").digest();
}

export function hmacIp(ip: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(ip, "utf8").digest();
}

export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}
