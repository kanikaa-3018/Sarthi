import { expect, test, type Page } from "@playwright/test";
import { API_BASE, loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("seller seeded account signs in through the visible login flow", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Seller.*Aggregate evidence only/i }).click();
  const authViewport = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    verticalOverflow: document.documentElement.scrollHeight - window.innerHeight
  }));
  expect(authViewport.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(authViewport.verticalOverflow).toBeLessThanOrEqual(0);
  const usernameWidth = (await page.getByLabel("Username").boundingBox())?.width ?? 0;
  const passwordWidth = (await page.getByLabel("Password", { exact: true }).boundingBox())?.width ?? 0;
  expect(Math.abs(usernameWidth - passwordWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Fill evaluator login" }).click();
  await expect(page.getByLabel("Username")).toHaveValue("seller.a");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch("/api/health");
    return response.ok;
  })).toBe(true);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login")),
    page.getByRole("button", { name: "Continue" }).click()
  ]);
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();

  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Next action" })).toBeVisible({ timeout: 15_000 });
});

test("seller Today page leads with one next action", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller");

  await expect(page.getByRole("heading", { name: "NayiDisha Fashions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Next action" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seller facts" })).toBeVisible();
  await expect(page.getByText(/\d\.\d from [\d,]+ buyer ratings/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});

test("seller routes expose focused workspaces", async ({ page, request }) => {
  test.setTimeout(60_000);
  await loginAs(page, request, "seller");

  for (const [path, selector, heading] of [
    ["/seller/products", ".seller-products-page", "Products"],
    ["/seller/new", ".seller-listing-page", "Create a listing"],
    ["/seller/proofs", ".seller-proofs-page", "Proof center"],
    ["/seller/market", ".seller-market-page", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(selector)).toContainText(heading);
  }
});

test("proof requests explain buyer impact and review urgency", async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, request, "seller");
  await page.goto("/seller/proofs");

  await expect(page.getByRole("heading", { name: "Proof center" })).toBeVisible();
  await expect(page.locator(".seller-proof-bulk-workbench")).toBeVisible();
  await expect(page.locator(".seller-proof-batch-strip")).toBeVisible();
  await expect(page.locator(".seller-proof-compact-list")).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose one proof file/i })).toBeVisible();
  await expect(page.getByText(/buyer asks/i).first()).toBeVisible();
  await expect(page.getByText(/after review|trust/i).first()).toBeVisible();
  expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(2);
});

test("new listing keeps seller input while moving through guided steps", async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, request, "seller");
  await page.goto("/seller/new");

  await expect(page.locator(".seller-step-count", { hasText: "Step 1 of 3" })).toBeVisible();
  const continueButton = await page.getByRole("button", { name: "Continue to image" }).boundingBox();
  expect(continueButton).not.toBeNull();
  expect((continueButton?.y ?? 0) + (continueButton?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  await page.getByLabel("Product title").fill("Blue cotton kurti");
  await page.getByLabel("Category").fill("women_kurtis");
  await page.getByLabel("Garment type").fill("kurti");
  await page.getByLabel("Fabric").fill("cotton");
  await page.getByLabel("Colour family").fill("blue");
  await page.getByLabel("Base price").fill("899");
  await page.getByRole("button", { name: "Continue to image" }).click();

  await expect(page.locator(".seller-step-count", { hasText: "Step 2 of 3" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Product title")).toHaveValue("Blue cotton kurti");
  await page.getByRole("button", { name: "Continue to image" }).click();
  await page.getByLabel("Or use a secure image link").fill("seeded://products/e2e/listing.jpg");
  await page.getByRole("button", { name: "Review listing" }).click();
  await expect(page.getByRole("img", { name: "Blue cotton kurti image preview unavailable" })).toBeVisible();
  await expect.poll(() => page.locator(".seller-review-layout img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length)).toBe(0);
});

test("verification documents appear only when verification blocks listing visibility", async ({ page, request }) => {
  const session = await loginAs(page, request, "seller");
  const onboardingResponse = await request.get(`${API_BASE}/seller/me/onboarding`, {
    headers: { authorization: `Bearer ${session.access_token}` }
  });
  expect(onboardingResponse.ok()).toBeTruthy();
  const payload = await onboardingResponse.json();
  await page.route("**/api/seller/me/onboarding", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        ...payload,
        seller_verification: {
          ...payload.seller_verification,
          verification_status: "pending",
          gst_status: "pending",
          kyc_status: "pending",
          restricted_reason: "Required business documents are waiting for review."
        }
      }
    });
  });
  await page.goto("/seller/new");

  const verification = page.getByRole("region", { name: "Complete seller verification" });
  await expect(verification).toBeVisible();
  await verification.getByLabel("Document type").selectOption("gst_certificate");
  await verification.getByLabel("Reference number").fill("GST-E2E-REF");
  await verification.getByLabel("Document file").setInputFiles({
    name: "gst-proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nseller verification e2e proof file\n%%EOF\n")
  });
  await page.unroute("**/api/seller/me/onboarding");

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/seller/me/verification/documents") &&
      response.request().method() === "POST" &&
      response.ok()
    ),
    verification.getByRole("button", { name: "Submit document" }).click()
  ]);
  await expect(page.getByText("Verification document sent for review.")).toBeVisible();
});

test("Market Compare explains evidence and one best improvement", async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, request, "seller");
  await page.goto("/seller/market");

  await expect(page.getByLabel("Product to compare")).toBeVisible();
  await expect(page.locator(".seller-market-position")).toBeVisible();
  await expect(page.locator(".seller-market-evidence")).toBeVisible();
  await expect(page.getByText("Buyer rating", { exact: true })).toBeVisible();
  await expect(page.getByText("Return behavior", { exact: true })).toBeVisible();
  await expect(page.getByText(/Best next improvement/i)).toBeVisible();
  await expect(page.locator(".seller-market-next")).toContainText(/return|proof|current/i);
  await expect(page.locator(".seller-market-next").getByRole("button")).toBeVisible();
  const nextActionBox = await page.locator(".seller-market-next").boundingBox();
  expect(nextActionBox).not.toBeNull();
  expect((nextActionBox?.y ?? 0) + (nextActionBox?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  await expect(page.getByText("Other useful improvements")).toHaveCount(0);
  await expect(page.getByText(/percentile|AI score/i)).toHaveCount(0);
  await expect(page.getByText(/Stronger evidence than 0 of/i)).toHaveCount(0);
});

test("Products keeps issue language readable and preserves measurement correction", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller/products");

  await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(1);
  await expect(page.getByLabel("Search products")).toBeVisible();
  await expect(page.getByText("Search products", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/too_large|color_different|fabric_different/)).toHaveCount(0);
  await expect.poll(() => page.locator(".seller-product-identity img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length)).toBe(0);

  const firstProofRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Upload proof" }) }).first();
  await firstProofRow.getByRole("button", { name: "Upload proof" }).click();
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Upload proof" })).not.toContainText(/too_large|color_different|fabric_different|Buyer demand/);
  await page.keyboard.press("Escape");
  await firstProofRow.getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/\/seller\/market\?product=/);
  await page.goto("/seller/products");

  await page.getByRole("button", { name: "Update measurements" }).first().click();
  await expect(page.getByRole("dialog", { name: "Update measurements" })).toBeVisible();
  await page.getByLabel("Size L chest").fill("38");
  await page.getByLabel("Size XL chest").fill("40");

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/correct-measurement") &&
      response.request().method() === "POST" &&
      response.ok()
    ),
    page.getByRole("button", { name: "Submit measurements" }).click()
  ]);

  await expect(page.getByText("Measurements sent for review.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Update measurements" })).toBeHidden();
});

test("proof dialog locks the page and restores focus", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAs(page, request, "seller");
  await page.goto("/seller/proofs");
  const trigger = page.getByRole("button", { name: "Upload" }).first();

  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Upload proof" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/seller-scroll-lock/);
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  expect(await page.evaluate(() => window.scrollY)).toBe(backgroundScroll);
  await dialog.getByLabel("What this proves").scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel("What this proves")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Submit/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("seller mobile routes keep their focused hierarchy without horizontal overflow", async ({ page, request }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "seller");

  for (const [path, selector, heading] of [
    ["/seller", ".seller-today-page", "Next action"],
    ["/seller/products", ".seller-products-page", "Products"],
    ["/seller/new", ".seller-listing-page", "Create a listing"],
    ["/seller/proofs", ".seller-proofs-page", "Proof center"],
    ["/seller/market", ".seller-market-page", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(selector)).toContainText(heading);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    const overflowSources = overflow > 2 ? await page.locator("body *").evaluateAll((elements) => elements
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right)
      }))
      .filter((item) => item.left < -2 || item.right > window.innerWidth + 2)
      .slice(0, 8)) : [];
    expect(overflow, `${path} horizontal overflow: ${JSON.stringify(overflowSources)}`).toBeLessThanOrEqual(2);

    if (path === "/seller/products") {
      const clippedFilters = await page.getByLabel("Product status filters").getByRole("button").evaluateAll((buttons) => buttons.filter((button) => {
        const box = button.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedFilters).toBe(0);
    }

    if (path === "/seller/new") {
      const clippedSteps = await page.getByRole("list", { name: "Listing progress" }).getByRole("listitem").evaluateAll((items) => items.filter((item) => {
        const box = item.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedSteps).toBe(0);
    }

    if (path === "/seller/market") {
      await expect(page.locator(".seller-market-position")).toBeVisible();
      await expect(page.locator(".seller-market-next")).toBeVisible();
      const recommendationAction = await page.locator(".seller-market-next").getByRole("button").boundingBox();
      expect(recommendationAction).not.toBeNull();
    }

    if (path === "/seller/proofs") {
      const clippedTabs = await page.getByRole("tab").evaluateAll((tabs) => tabs.filter((tab) => {
        const box = tab.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedTabs).toBe(0);
      const clippedRows = await page.locator(".seller-proof-compact-list article, .seller-proof-row").evaluateAll((rows) => rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedRows).toBe(0);
    }
  }
});

async function horizontalOverflowPx(page: Page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}
