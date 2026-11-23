import { test, expect } from "@playwright/test";
test("SMS dialog supports digit filtering, cancel and successful manual OTP", async ({
  page,
}) => {
  let diagnosticsRequests = 0;
  await page.route("**/sms/log", (route) => {
    diagnosticsRequests++;
    return route.abort();
  });
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
  expect(diagnosticsRequests).toBe(0);
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
test("failed SMS start shows the API error without opening OTP", async ({ page }) => {
  await page.route("**/sms/auth", route => route.fulfill({ status: 503, json: { error_description: "SMS service unavailable" } }));
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("SMS service unavailable");
  await expect(page.getByLabel("OTP code", { exact: true })).toHaveCount(0);
});

test("OTP dialog opens only after SMS start succeeds", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/sms/auth", async route => { await pending; await route.continue(); });
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  await expect(page.getByLabel("OTP code", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByLabel("OTP code", { exact: true })).toBeVisible();
});
test("editing an OTP during verification cannot start a second token exchange", async ({
  page,
}) => {
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/sms/token", async (route) => {
    requests++;
    await held;
    await route.continue();
  });
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    otp = dialog.getByLabel("OTP code", { exact: true });
  await otp.fill("123456");
  await dialog.getByRole("button", { name: "Verify", exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await otp.fill("654321");
  await expect(
    dialog.getByRole("button", { name: "Verifying…", exact: true }),
  ).toBeDisabled();
  expect(requests).toBe(1);
  release();
});


test("SMS dialog fits a small mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/sms/auth", route => route.fulfill({ json: { auth_req_id: "mobile-test", nonce: "mobile-nonce" } }));
  await page.goto("/auth/login#pnv");
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "SMS", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verify" })).toBeVisible();
});
