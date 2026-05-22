/**
 * Serves the static admin web UI files (index.html, admin.js, styles.css)
 * from the admin Fastify instance only. The CSP is locally relaxed to
 * allow the page's own JS and stylesheet to load.
 */
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/routes/ → ../../src/admin-ui/static at runtime, OR
// src/routes/ → ../admin-ui/static at dev time. Both shapes exist.
const candidates = [
  path.resolve(here, "..", "admin-ui", "static"),
  path.resolve(here, "..", "..", "src", "admin-ui", "static"),
  path.resolve(here, "..", "..", "..", "src", "admin-ui", "static"),
];

export async function adminUiRoutes(app: FastifyInstance): Promise<void> {
  const root = candidates.find((c) => existsSync(c));
  if (!root) {
    app.log.warn(
      { tried: candidates },
      "admin UI static folder not found; serving an empty stub",
    );
    app.get("/admin", async (_req, reply) => {
      reply
        .code(500)
        .type("text/plain")
        .send("Admin UI bundle missing. Run `npm run build:admin-ui`.");
    });
    return;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: "/admin/ui/",
    decorateReply: false,
    cacheControl: true,
    maxAge: 60_000,
  });

  // Per-route CSP override: admin UI needs to run its own bundled JS
  // and CSS. The default `default-src 'none'` would prevent the page
  // from loading. We narrow the relaxation to /admin/* GETs.
  app.addHook("onRequest", async (req, reply) => {
    if (req.method !== "GET") return;
    if (!req.url.startsWith("/admin")) return;
    if (req.url.startsWith("/admin/users") || req.url.startsWith("/admin/auth")) return;
    if (req.url.startsWith("/admin/me") || req.url.startsWith("/admin/setup")) return;
    if (req.url.startsWith("/admin/state")) return;
    reply.header(
      "content-security-policy",
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  // Top-level /admin and /admin/ both serve the SPA entry.
  app.get("/admin", async (_req, reply) => {
    return reply.redirect("/admin/ui/index.html", 302);
  });
  app.get("/admin/", async (_req, reply) => {
    return reply.redirect("/admin/ui/index.html", 302);
  });
  app.get("/admin/ui", async (_req, reply) => {
    return reply.redirect("/admin/ui/index.html", 302);
  });
}
