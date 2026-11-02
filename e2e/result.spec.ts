import { test, expect } from "@playwright/test";
for (const [name, verified] of [
  ["missing", undefined],
  ["boolean-true", true],
  ["boolean-false", false],
  ["string-true", "true"],
  ["string-false", "false"],
] as const) {
  test(`userinfo is visible immediately with the original ${name} verification value`, async ({
    page,
  }) => {
    if (verified === false)
      await page.setViewportSize({ width: 375, height: 812 });
    const prepared = await page.request.post("/auth/prepare", {
      data: { user_flow: "pvn_ip", server_id: "stage", qr: false },
    });
    const attempt = await prepared.json();
    await page.request.get(attempt.url, { maxRedirects: 0 });
    await page.goto(
      `/auth/callback/pvn_ip/stage?state=${attempt.state}&code=fixture-result-${name}`,
    );
    await expect(page).toHaveURL(/\/user\/info$/);
    const json = page.locator("pre");
    await expect(json).toBeVisible();
    expect(JSON.parse((await json.textContent())!)).toEqual({
      sub: "browser-user",
      phone_number: "+12025550123",
      ...(verified === undefined ? {} : { phone_number_verified: verified }),
      custom_claim: { enabled: false, count: 0, value: null },
    });
    const explanation = page.getByRole("complementary", {
      name: "Phone verification explanation",
    });
    if (verified === undefined) {
      await expect(explanation).toHaveCount(0);
      expect(JSON.parse((await json.textContent())!)).not.toHaveProperty(
        "phone_number_verified",
      );
    } else {
      await expect(explanation).toBeVisible();
      await expect(
        page.getByText("Phone verification succeeded.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(/Phone verification did not succeed/),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(verified === false ? 375 : 1280);
    await page.screenshot({
      path: `test-results/result-${name}.png`,
      fullPage: true,
    });
  });
}
