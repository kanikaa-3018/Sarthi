import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
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

  it("builds evaluator scenarios from current Mongo evidence records instead of fixed seed ids", async () => {
    const app = await buildApp(dbWith({
      buyers: [{ buyer_id: "buyer_dynamic", joined_at: "2026-07-20T08:00:00.000Z", fit_memory_enabled: 1 }],
      buyer_fit_profiles: [{
        profile_id: "profile_dynamic",
        buyer_id: "buyer_dynamic",
        label: "Asha",
        active: 1,
        size_map: { women_tops: "M" },
        updated_at: "2026-07-20T09:00:00.000Z"
      }],
      product_clusters: [{ cluster_id: "cluster_dynamic", label: "Daily tops" }],
      products: [
        { product_id: "ignored_product", cluster_id: "ignored_cluster", is_sarthi_eligible: 0, feed_rank: 1 },
        {
          product_id: "product_dynamic",
          cluster_id: "cluster_dynamic",
          category: "women_tops",
          garment_type: "top",
          fabric: "cotton jersey",
          is_sarthi_eligible: 1,
          feed_rank: 2
        }
      ],
      skus: [
        { variant_id: "product_dynamic_s", product_id: "product_dynamic", size: "S", stock: 6, current_price: 299 },
        { variant_id: "product_dynamic_m", product_id: "product_dynamic", size: "M", stock: 5, current_price: 329 }
      ]
    }));
    try {
      const response = await app.inject({ method: "GET", url: "/scenarios" });
      assert.equal(response.statusCode, 200);
      const scenario = response.json().scenarios[0];
      assert.equal(scenario.buyer_id, "buyer_dynamic");
      assert.equal(scenario.product_id, "product_dynamic");
      assert.equal(scenario.variant_id, "product_dynamic_m");
      assert.equal(scenario.cluster_id, "cluster_dynamic");
      assert.match(scenario.question, /size M/i);
      assert.notEqual(scenario.product_id, "kurti_1_1");
      assert.notEqual(scenario.buyer_id, "buyer_asha");
    } finally {
      await app.close();
    }
  });
});

function dbWith(tables: Record<string, any[]>): Db {
  return {
    collection(name: string) {
      const rows = tables[name] ?? [];
      return {
        findOne(query: Record<string, unknown> = {}, options: { sort?: Record<string, number> } = {}) {
          const selected = rows.filter((row) => matches(row, query));
          return Promise.resolve(sortRows(selected, options.sort)[0] ?? null);
        },
        find(query: Record<string, unknown> = {}) {
          let selected = rows.filter((row) => matches(row, query));
          return {
            sort(sort: Record<string, number>) {
              selected = sortRows(selected, sort);
              return this;
            },
            limit(count: number) {
              selected = selected.slice(0, count);
              return this;
            },
            toArray() {
              return Promise.resolve(selected);
            }
          };
        }
      };
    }
  } as unknown as Db;
}

function matches(row: Record<string, any>, query: Record<string, any>) {
  return Object.entries(query).every(([key, expected]) => row[key] === expected);
}

function sortRows(rows: any[], sort?: Record<string, number>) {
  if (!sort) return rows;
  const entries = Object.entries(sort);
  return [...rows].sort((left, right) => {
    for (const [key, direction] of entries) {
      if (left[key] === right[key]) continue;
      return (left[key] > right[key] ? 1 : -1) * (direction < 0 ? -1 : 1);
    }
    return 0;
  });
}
