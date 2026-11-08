import { expect, test } from "@playwright/test";

for (const allowed of [true, false, "missing", "throws"] as const) {
  test(`SIM buttons follow Digital Credentials protocol availability: ${allowed}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      Object.defineProperty(window, "DigitalCredential", {
        configurable: true,
        value:
          value === "missing"
            ? undefined
            : {
                userAgentAllowsProtocol(protocol: string) {
                  if (value === "throws") throw new Error("unavailable");
                  return protocol === "openid4vp-v1-unsigned" && value;
                },
              },
      });
    }, allowed);
    await page.goto("/auth/login#pnv");
    const pnvSim = page.locator("#pvn_sim");
    const loginSim = page.locator("#login_sim");
    await expect(page.getByRole("tab", { name: "PNV" })).toBeVisible();
    if (allowed === true) await expect(pnvSim).toBeVisible();
    else await expect(pnvSim).toHaveCount(0);
    await page.getByRole("tab", { name: "Login" }).click();
    if (allowed === true) await expect(loginSim).toBeVisible();
    else await expect(loginSim).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeVisible();
  });
}
