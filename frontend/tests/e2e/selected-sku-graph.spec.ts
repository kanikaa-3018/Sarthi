import { expect, test } from "@playwright/test";
import { API_BASE, loginAs, resetSeed } from "./helpers";

test.setTimeout(60_000);

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("buyer route, seller compare, and graph stay on the selected SKU size", async ({ page, request }) => {
  const session = await loginAs(page, request, "buyer");
  await page.goto("/shop/product/kurti_1_1?variant=kurti_1_1_l");

  await expect(page.locator(".product-detail-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blue Floral Cotton Kurti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "L", exact: true })).toHaveClass(/active/);

  const compareResponse = await request.post(`${API_BASE}/compare`, {
    headers: { authorization: `Bearer ${session.access_token}` },
    data: {
      buyer_id: "buyer_asha",
      cluster_id: "cluster_floral_blue",
      product_id: "kurti_1_1",
      selected_variant_id: "kurti_1_1_l",
      preferred_fit: "comfort"
    }
  });
  expect(compareResponse.ok(), await compareResponse.text()).toBeTruthy();
  const compare = await compareResponse.json();
  expect(compare.ranking.selected_variant_id).toBe("kurti_1_1_l");
  expect(compare.ranking.selected_size).toBe("L");
  expect(compare.ranking.candidates.length).toBeGreaterThan(1);
  expect(compare.ranking.candidates.every((candidate: { variant_id: string }) => candidate.variant_id.endsWith("_l"))).toBeTruthy();

  const graphResponse = await request.get(
    `${API_BASE}/knowledge-graph/clusters/cluster_floral_blue?buyer_id=buyer_asha&product_id=kurti_1_1&selected_variant_id=kurti_1_1_l`,
    { headers: { authorization: `Bearer ${session.access_token}` } }
  );
  expect(graphResponse.ok(), await graphResponse.text()).toBeTruthy();
  const graph = await graphResponse.json();
  expect(graph.selected_product_id).toBe("kurti_1_1");
  expect(graph.selected_variant_id).toBe("kurti_1_1_l");
  expect(graph.selected_size).toBe("L");
  expect(graph.seller_context.slice(0, 3).every((context: { variant: { size: string; variant_id: string } }) =>
    context.variant.size === "L" && context.variant.variant_id.endsWith("_l")
  )).toBeTruthy();
  expect(graph.nodes.some((node: { id: string }) => node.id === "sku:kurti_1_1_l")).toBeTruthy();
  expect(graph.nodes.some((node: { id: string }) => node.id === "sku:kurti_1_1_xl")).toBeFalsy();
});
