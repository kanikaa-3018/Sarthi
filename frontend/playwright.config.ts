import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 58001);
const webPort = Number(process.env.E2E_WEB_PORT ?? 58173);
const apiBase = `http://127.0.0.1:${apiPort}`;
const webBase = `http://127.0.0.1:${webPort}`;
process.env.E2E_API_BASE = apiBase;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: webBase,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm --prefix ../apps/api run dev",
      url: `${apiBase}/health`,
      env: {
        PORT: String(apiPort),
        BEDROCK_ENABLED: "false",
        AI_PROVIDER_ORDER: ""
      },
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: webBase,
      env: { VITE_API_TARGET: apiBase },
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
