import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(here, "../../.env"),
  resolve(here, "../../../../.env")
]) {
  config({ path, override: false });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDbName: process.env.MONGODB_DB ?? "sarthi",
  authSecret: process.env.AUTH_SECRET ?? "dev-only-change-me",
  seedOnStart: process.env.SEED_ON_START === "true",
  demoControlsEnabled: process.env.DEMO_CONTROLS_ENABLED !== "false"
};

export function isProduction() {
  return env.nodeEnv === "production";
}
