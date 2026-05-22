/**
 * Login-specific rate limiter, on top of the global IP rate limit Fastify
 * already enforces. We track two keys per attempt: the account (email_hash
 * or zeros if unknown) and the client IP hash. An attempt is allowed only
 * if BOTH keys are below their respective thresholds.
 *
 * Defaults:
 *   - 5 failed attempts per (account_key, 15-minute window)
 *   - 20 failed attempts per (ip_hash, 15-minute window)
 *
 * A successful attempt is recorded but does not consume the budget.
 */
import type { Database } from "better-sqlite3";

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_MAX_FAIL = 5;
const IP_MAX_FAIL = 20;
const RETENTION_MS = 24 * 60 * 60 * 1000; // keep 24h for audit visibility

export interface LoginRateLimiter {
  check(accountKey: Buffer, ipHash: Buffer, now?: number): {
    allowed: boolean;
    retryAfterMs: number;
  };
  record(accountKey: Buffer, ipHash: Buffer, succeeded: boolean, now?: number): void;
  purgeOld(now?: number): number;
}

export function createLoginRateLimiter(db: Database): LoginRateLimiter {
  const stmtCountAccount = db.prepare(
    "SELECT COUNT(*) AS n, MIN(attempted_at) AS earliest FROM login_attempts WHERE account_key = ? AND succeeded = 0 AND attempted_at > ?",
  );
  const stmtCountIp = db.prepare(
    "SELECT COUNT(*) AS n, MIN(attempted_at) AS earliest FROM login_attempts WHERE ip_hash = ? AND succeeded = 0 AND attempted_at > ?",
  );
  const stmtInsert = db.prepare(
    "INSERT INTO login_attempts (account_key, ip_hash, attempted_at, succeeded) VALUES (?, ?, ?, ?)",
  );
  const stmtPurge = db.prepare("DELETE FROM login_attempts WHERE attempted_at <= ?");

  return {
    check(accountKey, ipHash, now = Date.now()) {
      const since = now - WINDOW_MS;
      const acc = stmtCountAccount.get(accountKey, since) as { n: number; earliest: number | null };
      const ip = stmtCountIp.get(ipHash, since) as { n: number; earliest: number | null };
      if (acc.n >= ACCOUNT_MAX_FAIL) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, WINDOW_MS - (now - (acc.earliest ?? now))),
        };
      }
      if (ip.n >= IP_MAX_FAIL) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, WINDOW_MS - (now - (ip.earliest ?? now))),
        };
      }
      return { allowed: true, retryAfterMs: 0 };
    },

    record(accountKey, ipHash, succeeded, now = Date.now()) {
      stmtInsert.run(accountKey, ipHash, now, succeeded ? 1 : 0);
    },

    purgeOld(now = Date.now()) {
      return stmtPurge.run(now - RETENTION_MS).changes;
    },
  };
}

/** A 16-byte zero buffer used as the account key when the email_hash is
 * unknown. We must still rate-limit those calls or an attacker could probe
 * many emails from a single IP cheaply. */
export const UNKNOWN_ACCOUNT_KEY: Buffer = Buffer.alloc(16, 0);
