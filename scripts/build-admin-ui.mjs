#!/usr/bin/env node
/**
 * Bundles the admin UI client (TypeScript + @cloudflare/opaque-ts) into a
 * single browser-ready ES module emitted at src/admin-ui/static/admin.js.
 *
 * Invoked from `npm run build` so the bundle is present before the tsc
 * step (which only handles server code).
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

await build({
  entryPoints: [path.join(root, "src/admin-ui/client/main.ts")],
  outfile: path.join(root, "src/admin-ui/static/admin.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
