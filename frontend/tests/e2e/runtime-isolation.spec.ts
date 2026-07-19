import { expect, test } from "@playwright/test";
import { API_BASE, E2E_DATABASE_NAME } from "./helpers";

test("E2E runs against the isolated auth database", async ({ request }) => {
  const response = await request.get(`${API_BASE}/health`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const health = await response.json();
  expect(health.db).toBe(E2E_DATABASE_NAME);
});

test("API helpers cannot bypass the owned E2E API port", () => {
  expect(API_BASE).toBe(`http://127.0.0.1:${process.env.E2E_API_PORT ?? "8200"}`);
});
