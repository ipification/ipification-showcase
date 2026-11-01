import { expect, test } from "@playwright/test";

// The local fixture provider redirects back with a code and returns fixed userinfo.
// These tests exercise the real Showcase backend and browser session; no real provider is called.
for (const flow of [
  { tab: "pnv", button: "IP", userFlow: "pvn_ip", phone: true },
  { tab: "pnv", button: "IP+", userFlow: "pvn_ip_plus", phone: true },
  { tab: "login", button: "IP", userFlow: "login_ip", phone: false },
  { tab: "login", button: "IP+", userFlow: "login_ip_plus", phone: false },
  {
    tab: "identity",
    button: "Anonymous Identity",
    userFlow: "anonymous",
    phone: false,
  },
  { tab: "identity", button: "KYC", userFlow: "kyc_phone", phone: true },
] as const) {
  test(`mobile ${flow.userFlow} completes through the provider and displays userinfo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/auth/login#${flow.tab}`);
    if (flow.phone) {
      await expect(
        page.getByRole("button", { name: /Change country for phone number/ }),
      ).toBeVisible();
      await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
    }
    const authorize = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/protocol/openid-connect/auth");
    });
    await page.getByRole("button", { name: flow.button, exact: true }).click();
    const query = new URL((await authorize).url()).searchParams;
    expect(query.get("redirect_uri")).toContain(
      `/auth/callback/${flow.userFlow}/stage`,
    );
    expect(query.get("response_type")).toBe("code");
    expect(query.get("login_hint")).toBe(flow.phone ? "12025550123" : null);
    await expect(page).toHaveURL(/\/user\/info$/);
    const userInfo = JSON.parse((await page.locator("pre").textContent())!);
    expect(userInfo.sub).toBe("browser-user");
    expect(userInfo.phone_number_verified).toBe("true");
  });
}

test("a provider error returns to login and shows the callback message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/auth/start?**", async (route) => {
    // Let the app set the callback cookie, then simulate a provider error redirect.
    const start = await route.fetch({ maxRedirects: 0 });
    const authorization = new URL(start.headers().location);
    const callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.searchParams.set(
      "state",
      authorization.searchParams.get("state")!,
    );
    callback.searchParams.set("error", "access_denied");
    await route.fulfill({
      response: start,
      headers: { ...start.headers(), location: callback.href },
    });
  });
  await page.goto("/auth/login#pnv");
  await expect(
    page.getByRole("button", { name: /Change country for phone number/ }),
  ).toBeVisible();
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(
    page.getByRole("dialog", { name: "access_denied" }),
  ).toBeVisible();
});
