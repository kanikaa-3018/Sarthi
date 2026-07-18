import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { registerAdminRoutes } from "./admin.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBuyerRoutes } from "./buyer.js";
import { registerDecisionRoutes } from "./decision.js";
import { registerSellerRoutes } from "./seller.js";
import { registerSystemRoutes } from "./system.js";

export async function registerRoutes(app: FastifyInstance, db: Db) {
  await registerSystemRoutes(app, db);
  await registerAuthRoutes(app, db);
  await registerSellerRoutes(app, db);
  await registerAdminRoutes(app, db);
  await registerBuyerRoutes(app, db);
  await registerDecisionRoutes(app, db);
}
