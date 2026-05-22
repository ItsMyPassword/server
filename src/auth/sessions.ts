/**
 * Session lifecycle. Tokens are opaque base64url strings; the server only
 * ever stores SHA-256(token). A leaked DB cannot be used to forge a
 * session because the cleartext token never touches disk.
 */
import type { Database } from "better-sqlite3";

import { generateToken, hashToken } from "../crypto/tokens.js";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionRecord {
  userId: Buffer;
  deviceId: Buffer;
  expiresAt: number;
}

export interface SessionService {
  create(userId: Buffer, deviceId: Buffer, ttlMs?: number): {
    token: string;
    expiresAt: number;
  };
  resolve(token: string): SessionRecord | null;
  revoke(token: string): boolean;
  revokeAllForUser(userId: Buffer): number;
  revokeAllForDevice(deviceId: Buffer): number;
  purgeExpired(now?: number): number;
}

export function createSessionService(db: Database): SessionService {
  const stmtInsert = db.prepare(
    "INSERT INTO sessions (token_hash, user_id, device_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const stmtLookup = db.prepare(
    "SELECT user_id, device_id, expires_at FROM sessions WHERE token_hash = ?",
  );
  const stmtTouch = db.prepare(
    "UPDATE sessions SET last_used_at = ? WHERE token_hash = ?",
  );
  const stmtDelete = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const stmtDeleteByUser = db.prepare("DELETE FROM sessions WHERE user_id = ?");
  const stmtDeleteByDevice = db.prepare("DELETE FROM sessions WHERE device_id = ?");
  const stmtPurge = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");

  return {
    create(userId, deviceId, ttlMs = DEFAULT_TTL_MS) {
      const token = generateToken();
      const tokenHash = hashToken(token);
      const now = Date.now();
      const expiresAt = now + ttlMs;
      stmtInsert.run(tokenHash, userId, deviceId, now, now, expiresAt);
      return { token, expiresAt };
    },

    resolve(token) {
      const tokenHash = hashToken(token);
      const row = stmtLookup.get(tokenHash) as
        | { user_id: Buffer; device_id: Buffer; expires_at: number }
        | undefined;
      if (!row) return null;
      if (row.expires_at <= Date.now()) {
        stmtDelete.run(tokenHash);
        return null;
      }
      stmtTouch.run(Date.now(), tokenHash);
      return {
        userId: row.user_id,
        deviceId: row.device_id,
        expiresAt: row.expires_at,
      };
    },

    revoke(token) {
      const r = stmtDelete.run(hashToken(token));
      return r.changes > 0;
    },

    revokeAllForUser(userId) {
      return stmtDeleteByUser.run(userId).changes;
    },

    revokeAllForDevice(deviceId) {
      return stmtDeleteByDevice.run(deviceId).changes;
    },

    purgeExpired(now = Date.now()) {
      return stmtPurge.run(now).changes;
    },
  };
}
