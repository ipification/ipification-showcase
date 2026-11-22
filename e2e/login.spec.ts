import { test, expect } from "@playwright/test";
test("configured flow tabs and preferences survive refresh without Bootstrap", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await expect(
    page.getByRole("tab", { name: "PNV", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/#login$/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Login", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.locator('script[src*="jquery"],link[href*="bootstrap"]').count(),
  ).toBe(0);
});
test("blocked localStorage does not prevent configured flow selection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  await page.goto("/auth/login");
  await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Anonymous Identity", exact: true }),
  ).toBeVisible();
});

test("touch users can switch every flow tab on mobile Chrome", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || "3002"}`,
  });
  const page = await context.newPage();
  try {
    await page.goto("/auth/login");
    for (const [name, hash, title] of [
      ["Login", "login", "Quick Access"],
      ["Identity", "identity", "Mobile ID & Know Your Customer"],
      ["PNV", "pnv", "Phone Number Verification"],
    ]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.tap();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("server render shows loading until browser preferences are ready", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || "3002"}`,
  });
  try {
    const page = await context.newPage();
    await page.goto("/auth/login#login");
    await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("status")).toHaveText("Loading…");
    await expect(page.locator(".showcase-brand-logo")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "PNV" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Phone Number Verification" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("initial tab prefers hash over saved preference", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("selector", "identity"));
  await page.goto("/auth/login#login");
  await expect(
    page.getByRole("tab", { name: "Login", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await page.goto("/auth/login");
  await expect(
    page.getByRole("tab", { name: "Identity", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/auth/login#invalid");
  await expect(
    page.getByRole("tab", { name: "Identity", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
test("configured title, favicon and logo styling are reflected in the page", async ({
  page,
}) => {
  await page.route("**/api/showcase-config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    Object.assign(config, {
      title: "Custom Showcase",
      faviconUrl: "/images/logo.ico",
      logoUrl: "/images/logo/ipification-horizontal-black.svg",
      logoStyle: "max-width: 123px",
    });
    await route.fulfill({ response, json: config });
  });
  await page.goto("/auth/login");
  await expect(page).toHaveTitle("Custom Showcase");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/images/logo.ico",
  );
  await expect(page.locator(".showcase-brand-logo")).toHaveCSS(
    "max-width",
    "123px",
  );
  await expect(
    page.getByRole("link", { name: "Privacy Policy" }),
  ).toHaveAttribute("target", "_blank");
});
