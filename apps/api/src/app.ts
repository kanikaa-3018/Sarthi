import cors from "@fastify/cors";
import Fastify from "fastify";
import type { Db } from "mongodb";
import { ZodError } from "zod";
import { registerRoutes } from "./routes/index.js";

export async function buildApp(db: Db) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const field = firstIssue?.path.length ? firstIssue.path.join(".") : "request";
      reply.code(400).send({ detail: `${field}: ${firstIssue?.message ?? "Invalid request"}` });
      return;
    }
    const statusCode = err.statusCode ?? 500;
    reply.code(statusCode).send({ detail: err.message || "Request failed" });
  });

  await registerRoutes(app, db);
  return app;
}
