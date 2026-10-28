import { test, expect } from "@playwright/test";
test("callback failure explains client configuration and lets the user restart login", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback/login_ip/stage?state=fixture-qrcode&code=browser-invalid-client",
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
