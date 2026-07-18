import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import { collections } from "../db/mongo.js";
import { publicAccount, requireAccount } from "../middleware/auth.js";
import { clientPasswordSecret, hashPassword, id, verifyPassword } from "../services/crypto.js";
import { createSession, revokeSession } from "../services/session.js";
import { nowIso } from "../services/time.js";

const clientHashSchema = z.string().regex(/^[a-f0-9]{64}$/i, "password_hash must be a SHA-256 hex digest");
const credentialSchema = z.object({
  username: z.string(),
  password_hash: clientHashSchema.optional(),
  password: z.string().optional()
}).refine((body) => body.password_hash || body.password, "Password is required");

export async function registerAuthRoutes(app: FastifyInstance, db: Db) {
  app.post("/auth/login", async (request, reply) => {
    const body = credentialSchema.parse(request.body);
    const account = await collections(db).accounts.findOne({
      username: body.username.trim().toLowerCase(),
      disabled: 0
    });
    if (!account || !verifyCredential(account, body)) {
      return reply.code(401).send({ detail: "Invalid username or password" });
    }
    const session = await createSession(db, account.account_id);
    return { account: publicAccount(account), ...session };
  });

  app.post("/auth/signup/buyer", async (request, reply) => {
    const body = z.object({
      username: z.string().min(3),
      password_hash: clientHashSchema.optional(),
      password: z.string().min(8).optional(),
      display_name: z.string().min(1),
      language: z.enum(["hinglish", "english"]).default("english")
    }).refine((input) => input.password_hash || input.password, "Password is required").parse(request.body);
    const username = body.username.trim().toLowerCase();
    if (await collections(db).accounts.findOne({ username })) {
      return reply.code(409).send({ detail: "Username already exists" });
    }
    const buyer_id = id("buyer");
    await collections(db).buyers.insertOne({
      buyer_id,
      display_name: body.display_name,
      language: body.language,
      cod_preferred: 1,
      fit_memory_enabled: 1,
      preferred_fit: "comfort",
      joined_at: nowIso()
    });
    await collections(db).buyerReviewProfiles.insertOne({
      buyer_id,
      marketplace_age_days: 0,
      delivered_orders: 0,
      returned_orders: 0,
      rto_orders: 0,
      return_rate: 0,
      rto_rate: 0,
      review_count: 0,
      verified_purchase_rate: 0,
      credibility_weight: 0.45,
      risk_band: "new_user",
      risk_signals: ["new_account", "no_order_history"],
      updated_at: nowIso()
    });
    const { salt, hash } = hashPassword(credentialSecret(body));
    const account = {
      account_id: id("acct"),
      username,
      display_name: body.display_name,
      role: "buyer",
      buyer_id,
      seller_id: null,
      password_salt: salt,
      password_hash: hash,
      password_client_hash_version: body.password_hash ? "sha256_v1" : "legacy_raw",
      disabled: 0,
      created_at: nowIso()
    };
    await collections(db).accounts.insertOne(account);
    return { account: publicAccount(account), ...(await createSession(db, account.account_id)) };
  });

  app.post("/auth/signup/seller", async (request, reply) => {
    const body = z.object({
      username: z.string().min(3),
      password_hash: clientHashSchema.optional(),
      password: z.string().min(8).optional(),
      business_name: z.string().min(1),
      gst_number: z.string().min(4),
      pickup_pincode: z.string().min(4),
      support_contact: z.string().min(3)
    }).refine((input) => input.password_hash || input.password, "Password is required").parse(request.body);
    const username = body.username.trim().toLowerCase();
    if (await collections(db).accounts.findOne({ username })) {
      return reply.code(409).send({ detail: "Username already exists" });
    }
    const seller_id = id("seller_user");
    await collections(db).sellers.insertOne({ seller_id, name: body.business_name, median_dispatch_hours: 48 });
    await collections(db).sellerProfiles.insertOne({
      seller_id,
      verification_status: "pending",
      gst_status: "pending_review",
      kyc_status: "under_review",
      pickup_pincode: body.pickup_pincode,
      categories: [],
      support_contact: body.support_contact,
      data_access_level: "limited",
      restricted_reason: null,
      last_verified_at: null
    });
    const application = {
      application_id: id("seller_app"),
      seller_id,
      business_name: body.business_name,
      gst_number: body.gst_number,
      pickup_pincode: body.pickup_pincode,
      support_contact: body.support_contact,
      status: "pending_review",
      created_at: nowIso()
    };
    await collections(db).sellerApplications.insertOne(application);
    const { salt, hash } = hashPassword(credentialSecret(body));
    const account = {
      account_id: id("acct"),
      username,
      display_name: body.business_name,
      role: "seller",
      buyer_id: null,
      seller_id,
      password_salt: salt,
      password_hash: hash,
      password_client_hash_version: body.password_hash ? "sha256_v1" : "legacy_raw",
      disabled: 0,
      created_at: nowIso()
    };
    await collections(db).accounts.insertOne(account);
    return {
      account: publicAccount(account),
      ...(await createSession(db, account.account_id)),
      application: {
        application_id: application.application_id,
        verification_status: "pending",
        status: "pending_review"
      }
    };
  });

  app.get("/auth/me", async (request, reply) => {
    const account = await requireAccount(db, request, reply);
    return { account: publicAccount(account) };
  });

  app.post("/auth/logout", async (request) => {
    await revokeSession(db, request.headers.authorization);
    return { ok: true };
  });
}

function credentialSecret(body: { password_hash?: string; password?: string }) {
  return body.password_hash ? clientPasswordSecret(body.password_hash) : String(body.password);
}

function verifyCredential(account: any, body: { password_hash?: string; password?: string }) {
  const candidates = [
    body.password_hash ? clientPasswordSecret(body.password_hash) : null,
    body.password
  ].filter(Boolean) as string[];
  return candidates.some((candidate) => verifyPassword(candidate, account.password_salt, account.password_hash));
}
