import { expect, test, type Locator } from "@playwright/test";
import { loginAs, resetSeed } from "./helpers";

const HI = {
  shop: "\u0916\u0930\u0940\u0926\u093E\u0930\u0940",
  trust: "\u092D\u0930\u094B\u0938\u093E",
  saved: "\u0938\u0947\u0935\u094D\u0921",
  today: "\u0906\u091C",
  products: "\u092A\u094D\u0930\u094B\u0921\u0915\u094D\u091F",
  proofCenter: "\u092A\u094D\u0930\u0942\u092B \u0938\u0947\u0902\u091F\u0930",
  ratingPlan: "\u0930\u0947\u091F\u093F\u0902\u0917 \u092A\u094D\u0932\u093E\u0928",
  review: "\u0930\u093F\u0935\u094D\u092F\u0942",
  aiQueue: "AI \u0915\u0924\u093E\u0930",
  risk: "\u0930\u093F\u0938\u094D\u0915"
};

const MOJIBAKE_MARKERS = /[\u00c0\u00c2\u00c3\u00e0\u00e2\u00e3\ufffd\u0080-\u009f]/;

test.beforeEach(async ({ request }) => {
  await resetSeed(request);
});

test("buyer navigation switches to readable Hindi", async ({ page, request }) => {
  await loginAs(page, request, "buyer");
  await page.goto("/shop");

  await page.getByLabel("Choose language").selectOption("hindi");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expectHindiNav(nav, [HI.shop, HI.trust, HI.saved]);
});

test("seller navigation switches to readable Hindi", async ({ page, request }) => {
  await loginAs(page, request, "seller");
  await page.goto("/seller");

  await page.getByLabel("Choose language").selectOption("hindi");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expectHindiNav(nav, [HI.today, HI.products, HI.proofCenter, HI.ratingPlan]);
});

test("reviewer navigation switches to readable Hindi", async ({ page, request }) => {
  await loginAs(page, request, "admin");
  await page.goto("/admin");

  await page.getByLabel("Choose language").selectOption("hindi");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expectHindiNav(nav, [HI.review, HI.aiQueue, HI.risk]);
});

async function expectHindiNav(nav: Locator, expectedLabels: string[]) {
  await expect.poll(async () => nav.innerText()).toEqual(expect.stringContaining(expectedLabels[0]));
  const text = await nav.innerText();
  expect(text).not.toMatch(MOJIBAKE_MARKERS);
  expect(countDevanagari(text)).toBeGreaterThan(8);
  for (const label of expectedLabels) {
    expect(text).toContain(label);
  }
}

function countDevanagari(text: string) {
  let count = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0x0900 && codePoint <= 0x097f) count += 1;
  }
  return count;
}
