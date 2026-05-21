# ItsMyPassword Server

> Self-hostable, zero-knowledge sync server for the ItsMyPassword browser
> extension (and future mobile clients).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-WIP-orange.svg)](#status)

## What it is

The extension is a **deterministic** password manager: passwords are derived
on demand from `master + domain + email` and never stored. The only data
worth syncing is the user's *account index* — which `(domain, username)`
pairs they have registered, and the per-site generation profile attached to
each one.

This server is that sync layer, with two strong properties:

1. **Zero-knowledge.** The server never sees the master password, an email
   address, a domain, or a username. It only stores opaque ciphertexts and
   their ordering metadata.
2. **No offline brute-force after a server compromise.** Authentication
   uses [OPAQUE](https://datatracker.ietf.org/doc/rfc9807/) (an
   asymmetric PAKE). Even a complete database dump leaks nothing that an
   attacker can use to crack the master offline.

## Status

🚧 **Work in progress.** Milestone M1 (scaffold + health) is in place;
auth, sync, and snapshots land in subsequent milestones.

## Self-host quickstart

```bash
git clone https://github.com/Loule95450/ItsMyPassword-Server.git
cd ItsMyPassword-Server

cp .env.example .env
# Generate a stable HMAC key — KEEP IT SECRET, never rotate it.
sed -i.bak "s|SERVER_HMAC_KEY=.*|SERVER_HMAC_KEY=$(openssl rand -base64 32)|" .env && rm .env.bak

# Set your domain so Caddy can issue a Let's Encrypt cert.
echo "DOMAIN=sync.example.com" >> .env
echo "ACME_EMAIL=you@example.com" >> .env

docker compose up -d
```

Health check: `curl https://sync.example.com/health` → `{"status":"ok"}`.

### Without a public domain (LAN / development)

Leave `DOMAIN=localhost` in `.env`. Caddy serves an internal self-signed
cert on `https://localhost`. Browsers will warn — fine for testing.

### Backups

`/data/itsmypassword.db` is the entire state. Snapshot the Docker volume,
or enable Litestream by mounting an extra config (see
[`docs/backups.md`](docs/backups.md) — coming in M6).

## Security

If you discover a security issue, please **do not** open a public issue.
See [SECURITY.md](./SECURITY.md). The full threat model lands in M6.

## Development

```bash
npm install
cp .env.example .env  # then set SERVER_HMAC_KEY
npm run dev           # tsx watch
npm test
npm run typecheck
```

## License

[MIT](./LICENSE)
