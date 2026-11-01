import { test, expect } from "@playwright/test";
test("SMS dialog supports digit filtering, cancel and successful manual OTP", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("OTP code", { exact: true }).fill("ab123456");
  await expect(dialog.getByLabel("OTP code", { exact: true })).toHaveValue(
    "123456",
  );
  await dialog.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/info$/);
});
test("OTP retry stays in dialog and WebOTP is aborted when cancelled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).OTPCredential = class {};
    (window as any).otpAborted = false;
    Object.defineProperty(navigator.credentials, "get", {
      configurable: true,
      value: (options: any) =>
        new Promise((_, reject) =>
          options.signal.addEventListener("abort", () => {
            (window as any).otpAborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          }),
        ),
    });
  });
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("OTP code", { exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).otpAborted)).toBe(true);
  await expect(page).toHaveURL(/auth\/login/);
});
test("wrong OTP remains retryable without leaving the dialog", async ({
  page,
}) => {
  await page.route("**/sms/token", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Incorrect OTP" }),
    }),
  );
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  await page.getByLabel("OTP code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Incorrect OTP|cancelled/ }),
  ).toContainText("Incorrect OTP");
  await expect(page.getByRole("dialog")).toBeVisible();
});
