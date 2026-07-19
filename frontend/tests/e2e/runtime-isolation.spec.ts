import { expect, test } from "@playwright/test";
import { API_BASE } from "./helpers";

test("E2E runs against the isolated auth database", async ({ request }) => {
  const response = await request.get(`${API_BASE}/health`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const health = await response.json();
  expect(health.db).toBe(process.env.E2E_MONGODB_DB ?? "sarthi_codex_auth_e2e");
});
