import { expect, test } from "@playwright/test";
import { loginAs, resetSeed } from "./helpers";

test("capture safety loader screenshot", async ({ page, request }) => {
  await resetSeed(request);
  await loginAs(page, request, "buyer");
  
  await page.goto("/shop");
  
  // Wait for the feed products to load
  await expect(page.locator(".buyer-product-card").first()).toBeVisible();
  
  // Click the safety button on the first card
  const firstCard = page.locator(".buyer-product-card").first();
  const safetyButton = firstCard.getByRole("button", { name: "Safety" });
  await safetyButton.click();
  
  // Wait for 800ms to allow the progressive loader animation to start and advance to a nice step
  await page.waitForTimeout(800);
  
  // Verify the safety check loading overlay is visible
  await expect(page.locator(".safety-check-loading-overlay")).toBeVisible();
  
  // Take screenshot and save it to the workspace root
  await page.screenshot({
    path: "../safety_check_loader.png",
    fullPage: false
  });
  
  console.log("Screenshot safety_check_loader.png saved successfully at root!");
});
