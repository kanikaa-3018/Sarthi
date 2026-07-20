import { env, isProduction } from "./config/env.js";
import { closeMongo, connectMongo } from "./db/mongo.js";
import { resetMongoSeed } from "./data/seed.js";
import { buildApp } from "./app.js";

const db = await connectMongo();
if (env.seedOnStart && !isProduction()) {
  await resetMongoSeed(db);
}

const app = await buildApp(db);

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "Shutting down Sarthi API");
  try {
    await app.close();
    await closeMongo();
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "Sarthi API shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.port, host: "0.0.0.0" });
