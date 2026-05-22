import type { FastifyRequest, FastifyReply } from "fastify";

import type { SessionService } from "../auth/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: Buffer;
      deviceId: Buffer;
    };
  }
}

/** Parses `Authorization: Bearer <token>`, validates it, populates
 * `req.auth`. Returns 401 with a generic message on any failure. */
export function bearerAuth(sessions: SessionService) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = req.headers["authorization"];
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      void reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    if (token.length < 16) {
      void reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const session = sessions.resolve(token);
    if (!session) {
      void reply.code(401).send({ error: "unauthorized" });
      return;
    }
    req.auth = { userId: session.userId, deviceId: session.deviceId };
  };
}
