import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { tokenHash } from "../services/crypto.js";

export type AuthAccount = {
  account_id: string;
  username: string;
  display_name: string;
  role: "buyer" | "seller" | "admin";
  buyer_id: string | null;
  seller_id: string | null;
};

export function publicAccount(account: any): AuthAccount {
  return {
    account_id: account.account_id,
    username: account.username,
    display_name: account.display_name,
    role: account.role,
    buyer_id: account.buyer_id ?? null,
    seller_id: account.seller_id ?? null
  };
}

export async function accountForRequest(db: Db, request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice("bearer ".length).trim();
  const session = await collections(db).sessions.findOne({
    token_hash: tokenHash(token),
    revoked_at: null,
    expires_at: { $gt: new Date().toISOString() }
  });
  if (!session) return null;
  return collections(db).accounts.findOne({ account_id: session.account_id, disabled: 0 });
}

export async function requireAccount(db: Db, request: FastifyRequest, reply: FastifyReply) {
  const account = await accountForRequest(db, request);
  if (!account) {
    throwHttpError("Authentication required", 401);
  }
  return account;
}

export async function requireRole(db: Db, request: FastifyRequest, reply: FastifyReply, role: AuthAccount["role"]) {
  const account = await requireAccount(db, request, reply);
  if (!account || account.role !== role) {
    throwHttpError(`${role} role required`, 403);
  }
  return account;
}

export function assertBuyer(account: any, buyerId: string) {
  if (account.role !== "buyer" || account.buyer_id !== buyerId) {
    const error = new Error("Buyer account cannot access another buyer");
    (error as any).statusCode = 403;
    throw error;
  }
}

export function assertSeller(account: any, sellerId: string) {
  if (account.role !== "seller" || account.seller_id !== sellerId) {
    const error = new Error("Seller account cannot access another seller");
    (error as any).statusCode = 403;
    throw error;
  }
}

function throwHttpError(message: string, statusCode: number): never {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
}
