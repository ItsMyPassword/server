/**
 * Append-only audit log. Records who did what — without ever logging
 * secrets, blobs, or raw identifiers. Stored fields are the user_id,
 * device_id, action verb, and the HMAC'd IP.
 */
import type { Database } from "better-sqlite3";

export type AuditAction =
  | "register"
  | "login_success"
  | "login_failure"
  | "logout"
  | "device_revoke"
  | "account_delete";

export interface AuditLogger {
  log(args: {
    userId?: Buffer | null;
    deviceId?: Buffer | null;
    action: AuditAction;
    ipHash?: Buffer | null;
    metadata?: Record<string, unknown>;
  }): void;
}

export function createAuditLogger(db: Database): AuditLogger {
  const stmt = db.prepare(
    "INSERT INTO audit_log (user_id, device_id, action, ip_hash, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  return {
    log({ userId, deviceId, action, ipHash, metadata }) {
      stmt.run(
        userId ?? null,
        deviceId ?? null,
        action,
        ipHash ?? null,
        metadata ? JSON.stringify(metadata) : null,
        Date.now(),
      );
    },
  };
}
