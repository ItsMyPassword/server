/**
 * Login challenges hold the server's `ExpectedAuthResult` between
 * /login/start and /login/finish. They are single-use and expire fast.
 */
import type { Database } from "better-sqlite3";

import { generateToken, hashToken } from "../crypto/tokens.js";

const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export interface ChallengeRecord {
  userId: Buffer | null; // null when the challenge was dummy (anti-enumeration)
  isDummy: boolean;
  expectedBlob: Buffer;
}

export interface ChallengeService {
  create(userId: Buffer | null, expectedBlob: Buffer, isDummy: boolean): {
    token: string;
    expiresAt: number;
  };
  /** Consumes the challenge: returns it if valid, then deletes it. */
  consume(token: string): ChallengeRecord | null;
  purgeExpired(now?: number): number;
}

export function createChallengeService(db: Database): ChallengeService {
  const stmtInsert = db.prepare(
    "INSERT INTO login_challenges (token_hash, user_id, is_dummy, expected_blob, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const stmtLookup = db.prepare(
    "SELECT user_id, is_dummy, expected_blob, expires_at FROM login_challenges WHERE token_hash = ?",
  );
  const stmtDelete = db.prepare("DELETE FROM login_challenges WHERE token_hash = ?");
  const stmtPurge = db.prepare("DELETE FROM login_challenges WHERE expires_at <= ?");

  return {
    create(userId, expectedBlob, isDummy) {
      const token = generateToken();
      const now = Date.now();
      const expiresAt = now + CHALLENGE_TTL_MS;
      stmtInsert.run(
        hashToken(token),
        userId,
        isDummy ? 1 : 0,
        expectedBlob,
        now,
        expiresAt,
      );
      return { token, expiresAt };
    },

    consume(token) {
      const tokenHash = hashToken(token);
      const row = stmtLookup.get(tokenHash) as
        | {
            user_id: Buffer | null;
            is_dummy: number;
            expected_blob: Buffer;
            expires_at: number;
          }
        | undefined;
      // single-use: always delete, even on failure
      stmtDelete.run(tokenHash);
      if (!row) return null;
      if (row.expires_at <= Date.now()) return null;
      return {
        userId: row.user_id,
        isDummy: row.is_dummy === 1,
        expectedBlob: row.expected_blob,
      };
    },

    purgeExpired(now = Date.now()) {
      return stmtPurge.run(now).changes;
    },
  };
}
