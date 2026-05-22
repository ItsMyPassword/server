/**
 * User / device repository. Email is never stored in clear; we key by
 * `email_hash` (HMAC under the server-side key, computed at the edge).
 */
import type { Database } from "better-sqlite3";

import { newUuidV7 } from "../crypto/ids.js";

export interface UserRow {
  id: Buffer;
  emailHash: Buffer;
  opaqueRecord: Buffer;
  kdfParams: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeviceRow {
  id: Buffer;
  userId: Buffer;
  pubkey: Buffer;
  label: string | null;
  createdAt: number;
  lastSeenAt: number;
}

export interface UserRepo {
  findByEmailHash(emailHash: Buffer): UserRow | null;
  findById(id: Buffer): UserRow | null;
  createUserAndDevice(args: {
    emailHash: Buffer;
    opaqueRecord: Buffer;
    kdfParams: string;
    devicePubkey: Buffer;
    deviceLabel: string | null;
  }): { user: UserRow; device: DeviceRow };
  createDevice(args: {
    userId: Buffer;
    pubkey: Buffer;
    label: string | null;
  }): DeviceRow;
  listDevices(userId: Buffer): DeviceRow[];
  deleteDevice(userId: Buffer, deviceId: Buffer): boolean;
  deleteUser(userId: Buffer): boolean;
  touchDevice(deviceId: Buffer): void;
}

export function createUserRepo(db: Database): UserRepo {
  const stmtFindByEmail = db.prepare(
    "SELECT id, email_hash, opaque_record, kdf_params, created_at, updated_at FROM users WHERE email_hash = ?",
  );
  const stmtFindById = db.prepare(
    "SELECT id, email_hash, opaque_record, kdf_params, created_at, updated_at FROM users WHERE id = ?",
  );
  const stmtInsertUser = db.prepare(
    "INSERT INTO users (id, email_hash, opaque_record, kdf_params, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const stmtInsertDevice = db.prepare(
    "INSERT INTO devices (id, user_id, pubkey, label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const stmtListDevices = db.prepare(
    "SELECT id, user_id, pubkey, label, created_at, last_seen_at FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC",
  );
  const stmtDeleteDevice = db.prepare(
    "DELETE FROM devices WHERE id = ? AND user_id = ?",
  );
  const stmtDeleteUser = db.prepare("DELETE FROM users WHERE id = ?");
  const stmtTouchDevice = db.prepare(
    "UPDATE devices SET last_seen_at = ? WHERE id = ?",
  );

  const mapUser = (r: Record<string, unknown>): UserRow => ({
    id: r["id"] as Buffer,
    emailHash: r["email_hash"] as Buffer,
    opaqueRecord: r["opaque_record"] as Buffer,
    kdfParams: r["kdf_params"] as string,
    createdAt: r["created_at"] as number,
    updatedAt: r["updated_at"] as number,
  });
  const mapDevice = (r: Record<string, unknown>): DeviceRow => ({
    id: r["id"] as Buffer,
    userId: r["user_id"] as Buffer,
    pubkey: r["pubkey"] as Buffer,
    label: (r["label"] as string | null) ?? null,
    createdAt: r["created_at"] as number,
    lastSeenAt: r["last_seen_at"] as number,
  });

  return {
    findByEmailHash(emailHash) {
      const row = stmtFindByEmail.get(emailHash) as Record<string, unknown> | undefined;
      return row ? mapUser(row) : null;
    },
    findById(id) {
      const row = stmtFindById.get(id) as Record<string, unknown> | undefined;
      return row ? mapUser(row) : null;
    },
    createUserAndDevice({ emailHash, opaqueRecord, kdfParams, devicePubkey, deviceLabel }) {
      const userId = newUuidV7();
      const deviceId = newUuidV7();
      const now = Date.now();
      const tx = db.transaction(() => {
        stmtInsertUser.run(userId, emailHash, opaqueRecord, kdfParams, now, now);
        stmtInsertDevice.run(deviceId, userId, devicePubkey, deviceLabel, now, now);
      });
      tx();
      return {
        user: {
          id: userId,
          emailHash,
          opaqueRecord,
          kdfParams,
          createdAt: now,
          updatedAt: now,
        },
        device: {
          id: deviceId,
          userId,
          pubkey: devicePubkey,
          label: deviceLabel,
          createdAt: now,
          lastSeenAt: now,
        },
      };
    },
    createDevice({ userId, pubkey, label }) {
      const id = newUuidV7();
      const now = Date.now();
      stmtInsertDevice.run(id, userId, pubkey, label, now, now);
      return { id, userId, pubkey, label, createdAt: now, lastSeenAt: now };
    },
    listDevices(userId) {
      const rows = stmtListDevices.all(userId) as Record<string, unknown>[];
      return rows.map(mapDevice);
    },
    deleteDevice(userId, deviceId) {
      return stmtDeleteDevice.run(deviceId, userId).changes > 0;
    },
    deleteUser(userId) {
      return stmtDeleteUser.run(userId).changes > 0;
    },
    touchDevice(deviceId) {
      stmtTouchDevice.run(Date.now(), deviceId);
    },
  };
}
