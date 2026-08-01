import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";

const originalMongoUri = env.mongoUri;
const originalDemoControls = env.demoControlsEnabled;
const originalNodeEnv = env.nodeEnv;

afterEach(() => {
  env.mongoUri = originalMongoUri;
  env.demoControlsEnabled = originalDemoControls;
  env.nodeEnv = originalNodeEnv;
});

describe("system routes", () => {
  it("reports local MongoDB mode on health when using a local URI", async () => {
    env.mongoUri = "mongodb://127.0.0.1:27017";
    const app = await buildApp({} as any);
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().database, "mongodb_local");
    } finally {
      await app.close();
    }
  });

  it("reports Atlas mode on health when using an SRV URI", async () => {
    env.mongoUri = "mongodb+srv://user:pass@example.mongodb.net";
    const app = await buildApp({} as any);
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().database, "mongodb_atlas");
    } finally {
      await app.close();
    }
  });

  it("keeps seed reset disabled unless explicitly enabled", async () => {
    env.demoControlsEnabled = false;
    env.nodeEnv = "development";
    const app = await buildApp({} as any);
    try {
      const response = await app.inject({ method: "POST", url: "/seed/reset" });
      assert.equal(response.statusCode, 403);
      assert.deepEqual(response.json(), { detail: "Seed reset disabled" });
    } finally {
      await app.close();
    }
  });
});
