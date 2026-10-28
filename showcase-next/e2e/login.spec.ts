import { test, expect } from "@playwright/test";
test("configured flow tabs and preferences survive refresh without Bootstrap", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await expect(
    page.getByRole("tab", { name: "PNV", exact: true }),
  ).toBeVisible();
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
