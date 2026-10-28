import { test, expect } from "@playwright/test";
test("TS43 sends credential response to token endpoint and renders results", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, "get", {
      value: async () => ({
        data: { vp_token: { "ipification.com": ["fixture-vp"] } },
      }),
      configurable: true,
    });
  });
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "SIM", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/info$/);
});
test("null credentials show cancellation and keep login available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, "get", {
      value: async () => null,
      configurable: true,
    });
  });
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "SIM", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Incorrect OTP|cancelled/ }),
  ).toContainText("cancelled");
  await expect(
    page.getByRole("button", { name: "SIM", exact: true }),
  ).toBeEnabled();
});
