import { expect, test } from "@playwright/test";
import { resolveE2eDatabaseName } from "../../e2eRuntime";
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

test("E2E database guard rejects non-test and production-like names", () => {
  expect(() => resolveE2eDatabaseName("sarthi")).toThrow(/Unsafe E2E database name/);
  expect(() => resolveE2eDatabaseName("sarthi_e2e_production")).toThrow(/Unsafe E2E database name/);
  expect(resolveE2eDatabaseName("sarthi_e2e_reviewer_ui")).toBe("sarthi_e2e_reviewer_ui");
});
