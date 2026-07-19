import { expect, test } from "@playwright/test";

test("capture session loader screenshot", async ({ page }) => {
  // Add storage keys so the app attempts to verify a stored session
  await page.addInitScript(() => {
    window.localStorage.setItem("sarthi.auth.session", JSON.stringify({
      access_token: "mock-session-token",
      account: { role: "buyer", buyer_id: "buyer_asha" }
    }));
  });

  let resolveAuthRequest!: () => void;
  let rejectAuthRequest!: (error: unknown) => void;
  const authRequestCompleted = new Promise<void>((resolve, reject) => {
    resolveAuthRequest = resolve;
    rejectAuthRequest = reject;
  });

  // Mock and delay the auth verification API call
  await page.route("**/api/auth/me", async (route) => {
    try {
      await page.waitForTimeout(4000);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          account: { role: "buyer", buyer_id: "buyer_asha" }
        })
      });
      resolveAuthRequest();
    } catch (error) {
      rejectAuthRequest(error);
      throw error;
    }
  });

  await page.goto("/shop");

  // Verify that the premium session loader wrapper is visible
  await expect(page.locator(".app-loading-wrapper")).toBeVisible();

  // Wait 600ms to allow the spinner/logo transition to settle
  await page.waitForTimeout(600);

  // Capture the screenshot and save it to the root folder
  await page.screenshot({
    path: "../safety_session_loader.png",
    fullPage: false
  });

  await authRequestCompleted;
  await expect(page.locator(".app-loading-wrapper")).toBeHidden();

  console.log("Screenshot safety_session_loader.png saved successfully at root!");
});
