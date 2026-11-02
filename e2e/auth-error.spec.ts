import { test, expect } from "@playwright/test";
test("callback failure explains client configuration and lets the user restart login", async ({
  page,
}) => {
  const prepared = await page.request.post("/auth/prepare", {
    data: { user_flow: "login_ip", server_id: "stage", qr: false },
  });
  const attempt = await prepared.json();
  // Capture the callback binding without following the fixture provider's success redirect.
  await page.request.get(attempt.url, { maxRedirects: 0 });
  await page.goto(
    `/auth/callback/login_ip/stage?state=${attempt.state}&code=browser-invalid-client`,
  );
  await expect(page).toHaveURL(/\/auth\/error\?/);
  await expect(
    page.getByRole("heading", {
      name: "The application could not sign in",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Check the client credentials/)).toBeVisible();
  await page.getByText("Error details", { exact: true }).click();
  await expect(
    page.getByText("CLIENT_AUTH_FAILED", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("401", { exact: true })).toBeVisible();
  await expect(page.getByText("invalid_client", { exact: true })).toBeVisible();
  await expect(page.getByText(/Support reference:/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "PRIVATE_PROVIDER_DIAGNOSTIC",
  );
  await page.screenshot({
    path: "test-results/auth-error-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("link", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: "test-results/auth-error-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test("callback error opens a dismissible popup on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/auth/login/error", (route) =>
    route.fulfill({ json: { error_message: "msisdn_country_mismatch" } }),
  );
  await page.goto("/auth/login#pnv");
  const dialog = page.getByRole("dialog", { name: "msisdn_country_mismatch" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("[role=tab]").filter({ hasText: "PNV" })).toBeVisible();
  await expect.poll(async () => Math.round((await dialog.boundingBox())!.y)).toBe(100);
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThan(375);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
