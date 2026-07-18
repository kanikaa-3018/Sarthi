import { env, isProduction } from "./config/env.js";
import { closeMongo, connectMongo } from "./db/mongo.js";
import { resetMongoSeed } from "./data/seed.js";
import { buildApp } from "./app.js";

const db = await connectMongo();
if (env.seedOnStart && !isProduction()) {
  await resetMongoSeed(db);
}

const app = await buildApp(db);

process.on("SIGINT", async () => {
  await closeMongo();
  process.exit(0);
});

await app.listen({ port: env.port, host: "0.0.0.0" });
