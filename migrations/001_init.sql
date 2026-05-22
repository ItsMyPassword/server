-- 001_init: identity + OPAQUE auth + sessions + audit
-- All blobs are opaque from the server's point of view: emails and IPs are
-- HMAC'd before storage, registration records are produced client-side and
-- never decrypted, session/challenge tokens are stored hashed.

CREATE TABLE server_secrets (
  k          TEXT PRIMARY KEY,
  v          BLOB NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE users (
  id            BLOB PRIMARY KEY,            -- UUIDv7 (16 bytes)
  email_hash    BLOB NOT NULL UNIQUE,        -- HMAC-SHA256(lower(email), SERVER_HMAC_KEY)
  opaque_record BLOB NOT NULL,               -- serialized RegistrationRecord
  kdf_params    TEXT NOT NULL,               -- JSON {algo, m, t, p, salt_b64} — informational, for client to reproduce key derivation
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE devices (
  id            BLOB PRIMARY KEY,            -- UUIDv7
  user_id       BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pubkey        BLOB NOT NULL,               -- ed25519 32 bytes
  label         TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TABLE login_challenges (
  token_hash    BLOB PRIMARY KEY,            -- SHA-256(challenge_token)
  user_id       BLOB,                        -- NULL when no real user matched (dummy challenge for anti-enumeration)
  is_dummy      INTEGER NOT NULL,            -- 0 or 1
  expected_blob BLOB NOT NULL,               -- serialized ExpectedAuthResult
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX idx_login_challenges_expiry ON login_challenges(expires_at);

CREATE TABLE sessions (
  token_hash   BLOB PRIMARY KEY,             -- SHA-256(session_token)
  user_id      BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    BLOB NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE login_attempts (
  account_key  BLOB NOT NULL,                -- user_id if known else 16-byte zero pad (still keyed by email_hash via account_or_ip table — see app code)
  ip_hash      BLOB NOT NULL,
  attempted_at INTEGER NOT NULL,
  succeeded    INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_login_attempts_acc ON login_attempts(account_key, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip  ON login_attempts(ip_hash, attempted_at DESC);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    BLOB REFERENCES users(id) ON DELETE SET NULL,
  device_id  BLOB REFERENCES devices(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  ip_hash    BLOB,
  metadata   TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_audit_user_time ON audit_log(user_id, created_at DESC);

-- The `schema_migrations` ledger is created by the migration runner
-- itself (see src/store/db.ts) so it can already exist when migrations
-- start running.
