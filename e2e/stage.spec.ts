import { test, expect } from "@playwright/test";
import { startApp, freePort } from "../tests/helpers/processes";
import { configFixture } from "../tests/helpers/config";
test("stage keeps Wonderland 999 country and disabled selector option", async ({
  page,
}) => {
  const config = configFixture({ disabled_select_country: true });
  const port = await freePort();
  const app = await startApp({
    NODE_ENV: "production",
    APP_ENV: "stage",
    NODE_CONFIG_ENV: "stage",
    NODE_CONFIG_DIR: config.dir,
    PORT: String(port),
  });
  try {
    await page.goto(app.url + "/auth/login#pnv");
    const input = page.getByLabel("Phone number", { exact: true });
    const ip = page.getByRole("button", { name: "IP", exact: true });
    await expect(ip).toBeDisabled();
    await input.fill("1");
    await expect(ip).toBeEnabled();
    await input.fill("");
    await expect(ip).toBeDisabled();
    await input.fill("123456789");
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".iti")).toContainText("+999");
  } finally {
    await app.stop();
    config.remove();
  }
});
