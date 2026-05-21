import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app.js";
import type { Config } from "../src/config/env.js";

const testConfig: Config = {
  port: 0,
  host: "127.0.0.1",
  databasePath: ":memory:",
  logLevel: "fatal",
  trustProxy: false,
  corsOrigins: [],
  serverHmacKey: Buffer.alloc(32, 1),
};

describe("health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testConfig);
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds 200 on GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("returns 404 on unknown route", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
  });
});
