import { test, expect } from "@playwright/test";
import { startApp, freePort } from "../tests/helpers/processes";
import { configFixture } from "../tests/helpers/config";
import { startRedis } from "../tests/helpers/redis";
test("stage keeps Wonderland 999 country and disabled selector option", async ({
  page,
}) => {
  const redis = await startRedis(),
    config = configFixture({ disabled_select_country: true });
  const port = await freePort();
  const app = await startApp({
    NODE_ENV: "production",
    APP_ENV: "stage",
    NODE_CONFIG_ENV: "stage",
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    PORT: String(port),
    REDIS_URL: redis.url,
  });
  try {
    await page.goto(app.url + "/auth/login#pnv");
    const input = page.getByLabel("Phone number", { exact: true });
    await input.fill("123456789");
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".iti")).toContainText("+999");
  } finally {
    await app.stop();
    config.remove();
    await redis.stop();
  }
});
