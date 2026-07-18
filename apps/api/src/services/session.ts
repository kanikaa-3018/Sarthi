import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { makeToken, tokenHash } from "./crypto.js";
import { nowIso } from "./time.js";

export async function createSession(db: Db, accountId: string) {
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const access_token = makeToken({ sub: accountId, exp: Math.floor(new Date(expires_at).getTime() / 1000) });
  await collections(db).sessions.insertOne({
    token_hash: tokenHash(access_token),
    account_id: accountId,
    created_at: nowIso(),
    expires_at,
    revoked_at: null
  });
  return { access_token, token_type: "bearer" as const, expires_at };
}

export async function revokeSession(db: Db, authorization?: string) {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return;
  await collections(db).sessions.updateOne(
    { token_hash: tokenHash(authorization.slice("bearer ".length).trim()) },
    { $set: { revoked_at: nowIso() } }
  );
}
