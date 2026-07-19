import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 58001);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 58173);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
);

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node ../apps/api/node_modules/tsx/dist/cli.mjs ../apps/api/src/server.ts",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnv,
        NODE_ENV: "test",
        PORT: String(apiPort),
        MONGODB_DB: `sarthi_codex_auth_e2e_${apiPort}`,
        DEMO_CONTROLS_ENABLED: "true",
        BEDROCK_ENABLED: "false",
        AI_PROVIDER_ORDER: "",
        GEMINI_API_KEY: ""
      }
    },
    {
      command: `node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnv,
        SARTHI_API_TARGET: apiUrl,
        SARTHI_FRONTEND_PORT: String(frontendPort)
      }
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
