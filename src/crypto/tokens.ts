/**
 * Opaque tokens for sessions and login challenges.
 *
 * The token is a 32-byte cryptographically random value, base64url-encoded
 * for transport. Only SHA-256(token) is persisted server-side, so a DB
 * dump cannot be used to impersonate sessions.
 */
import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
