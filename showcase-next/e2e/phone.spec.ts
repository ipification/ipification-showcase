import { test, expect } from "@playwright/test";
test("phone verification validates input and works at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  await expect(phone).toBeVisible();
  await phone.fill("2025550123");
  await expect(
    page.getByRole("button", { name: "IP", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
