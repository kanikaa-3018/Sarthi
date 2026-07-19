import { expect, test } from "@playwright/test";
import { API_BASE, loginAs, resetSeed } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("seller demo account signs in through the visible login flow", async ({ page }) => {
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
  await page.getByRole("button", { name: "Use demo" }).click();
  await expect(page.getByLabel("Username")).toHaveValue("seller.a");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole("heading", { name: "NayiDisha Fashions" })).toBeVisible();
});

test("seller Today page leads with one next action", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller");

  await expect(page.getByRole("heading", { name: "NayiDisha Fashions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Next action" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Seller facts" })).toBeVisible();
  await expect(page.getByText("4.4 from 6,048 buyer ratings")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Seller workspace" })).toBeVisible();
});

test("seller routes expose focused workspaces", async ({ page, request }) => {
  await loginAs(page, request, "seller");

  for (const [path, heading] of [
    ["/seller/products", "Products"],
    ["/seller/new", "Create a listing"],
    ["/seller/proofs", "Proof requests"],
    ["/seller/market", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("new listing keeps seller input while moving through guided steps", async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginAs(page, request, "seller");
  await page.goto("/seller/new");

  await expect(page.getByText("Step 1 of 3").first()).toBeVisible();
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

  await expect(page.getByText("Step 2 of 3").first()).toBeVisible();
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
  await expect(page.getByRole("table", { name: "Market evidence comparison" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Buyer rating/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /Fit feedback/i })).toBeVisible();
  await expect(page.getByText("Why this position")).toBeVisible();
  await expect(page.getByText("Best next improvement")).toBeVisible();
  await expect(page.locator(".seller-market-recommendation")).toContainText("Solid Cotton Daily Top Office Ready");
  const recommendationBox = await page.locator(".seller-market-recommendation").boundingBox();
  expect(recommendationBox).not.toBeNull();
  expect((recommendationBox?.y ?? 0) + (recommendationBox?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  await expect(page.getByText("Other useful improvements")).toHaveCount(0);
  await expect(page.getByText(/percentile|AI score/i)).toHaveCount(0);
  await expect(page.getByText(/Stronger evidence than 0 of/i)).toHaveCount(0);
});

test("Products keeps issue language readable and preserves measurement correction", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller/products");

  await expect(page.getByRole("button", { name: "New listing" })).toHaveCount(1);
  await expect(page.getByLabel("Search products")).toBeVisible();
  await expect(page.getByText("Search products", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/too_large|color_different|fabric_different/)).toHaveCount(0);
  await expect.poll(() => page.locator(".seller-product-identity img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length)).toBe(0);

  const comparisonRow = page.getByRole("row").filter({ hasText: "Printed Cotton Bedsheet Set Everyday Wear" });
  await comparisonRow.getByRole("button", { name: "Upload proof" }).click();
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toContainText("Recent returns");
  await expect(page.getByRole("dialog", { name: "Upload proof" })).not.toContainText("Buyer demand");
  await page.keyboard.press("Escape");
  await comparisonRow.getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/\/seller\/market\?product=kurti_8_1$/);
  await expect(page.getByLabel("Product to compare")).toHaveValue("kurti_8_1");
  await page.goto("/seller/products");

  const sizeRow = page.getByRole("row").filter({ hasText: "Maroon Festive Kurta Set Festival Edit" });
  await sizeRow.getByRole("button", { name: "Update measurements" }).click();
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
  const trigger = page.getByRole("button", { name: "Upload proof" }).first();

  await trigger.click();

  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/seller-scroll-lock/);
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  expect(await page.evaluate(() => window.scrollY)).toBe(backgroundScroll);
  await page.getByLabel("What this proves").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("What this proves")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Upload proof" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("seller mobile routes keep their focused hierarchy without horizontal overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, request, "seller");

  for (const [path, heading] of [
    ["/seller", "NayiDisha Fashions"],
    ["/seller/products", "Products"],
    ["/seller/new", "Create a listing"],
    ["/seller/proofs", "Proof requests"],
    ["/seller/market", "Market Compare"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
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
      const recommendation = await page.locator(".seller-market-recommendation").boundingBox();
      const selectedProduct = await page.locator(".seller-market-product").boundingBox();
      expect(recommendation).not.toBeNull();
      expect(selectedProduct).not.toBeNull();
      expect(recommendation?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(selectedProduct?.y ?? 0);
      const recommendationAction = await page.locator(".seller-market-recommendation").getByRole("button").boundingBox();
      expect(recommendationAction).not.toBeNull();
      expect((recommendationAction?.y ?? 0) + (recommendationAction?.height ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
    }

    if (path === "/seller/proofs") {
      const clippedTabs = await page.getByRole("tab").evaluateAll((tabs) => tabs.filter((tab) => {
        const box = tab.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedTabs).toBe(0);
      const clippedRows = await page.locator(".seller-proof-row").evaluateAll((rows) => rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      }).length);
      expect(clippedRows).toBe(0);
    }
  }
});
