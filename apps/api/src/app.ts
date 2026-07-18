import cors from "@fastify/cors";
import Fastify from "fastify";
import type { Db } from "mongodb";
import { registerRoutes } from "./routes/index.js";

export async function buildApp(db: Db) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
    reply.code(statusCode).send({ detail: err.message });
  });

  await registerRoutes(app, db);
  return app;
}
