import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { aiCacheFingerprint } from "./ai.js";
import { sha256 } from "./crypto.js";
import { nowIso } from "./time.js";

export function llmCacheKey(scope: string, payload: Record<string, unknown>) {
  return `${scope}:${sha256(JSON.stringify(stableCachePayload({
    ai: aiCacheFingerprint(),
    ...payload
  })))}`;
}

export async function readLlmCache(db: Db, cacheKey: string) {
  const row = await collections(db).llmCache.findOne({ cache_key: cacheKey, expires_at: { $gt: new Date() } });
  return row?.payload ?? null;
}

export async function writeLlmCache(db: Db, cacheKey: string, scope: string, payload: Record<string, unknown>) {
  await collections(db).llmCache.updateOne(
    { cache_key: cacheKey },
    {
      $set: {
        cache_key: cacheKey,
        scope,
        payload,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000)
      }
    },
    { upsert: true }
  );
}

function stableCachePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCachePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableCachePayload(item)])
    );
  }
  return value;
}
