/**
 * UUIDv7 (RFC 9562 §5.7): 48 bits of millisecond timestamp + 74 random
 * bits, with the version (7) and variant (RFC 4122) markers baked in.
 *
 * Stored as 16 raw bytes (BLOB) in SQLite so that the natural sort order
 * matches insertion order. Hex-serialized for JSON output.
 */
import { randomBytes } from "node:crypto";

export function newUuidV7(): Buffer {
  const buf = randomBytes(16);
  const ts = BigInt(Date.now());
  buf[0] = Number((ts >> 40n) & 0xffn);
  buf[1] = Number((ts >> 32n) & 0xffn);
  buf[2] = Number((ts >> 24n) & 0xffn);
  buf[3] = Number((ts >> 16n) & 0xffn);
  buf[4] = Number((ts >> 8n) & 0xffn);
  buf[5] = Number(ts & 0xffn);
  // version 7, top nibble of byte 6
  buf[6] = (buf[6]! & 0x0f) | 0x70;
  // RFC 4122 variant, top 2 bits of byte 8
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  return buf;
}

export function uuidToHex(b: Buffer): string {
  return b.toString("hex");
}

export function uuidFromHex(hex: string): Buffer {
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error("invalid uuid hex");
  return Buffer.from(hex, "hex");
}
