import crypto from "node:crypto";
import { env } from "../config/env.js";

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha256Bytes(input: Buffer | Uint8Array) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function clientPasswordSecret(clientHash: string) {
  return `client-sha256:${clientHash.trim().toLowerCase()}`;
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

export function makeToken(payload: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    ...payload,
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000)
  })).toString("base64url");
  const signingInput = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", env.authSecret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

export function tokenHash(token: string) {
  return sha256(`${env.authSecret}:${token}`);
}
