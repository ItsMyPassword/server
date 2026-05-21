import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";

import type { Config } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body",
          "res.body",
        ],
        remove: true,
      },
    },
    trustProxy: config.trustProxy,
    disableRequestLogging: false,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  await app.register(sensible);

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
  });

  await app.register(healthRoutes);

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: "not_found" });
  });

  return app;
}
