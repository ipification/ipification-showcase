import { test, expect } from "@playwright/test";
import { startApp, freePort } from "../tests/helpers/processes";
import { configFixture } from "../tests/helpers/config";
test("stage country dropdown supports search and keeps Wonderland", async ({
  page,
}) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.appEnv = "stage";
    config.disabledSelectCountry = false;
    await route.fulfill({ response, json: config });
  });
  await page.goto("/auth/login#pnv");
  await page.getByRole("button", { name: /change country/i }).click();
  const search = page.getByRole("searchbox", { name: /search country/i });
  await search.fill("vietnam");
  await page.getByRole("option", { name: /vietnam.*84/i }).click();
  await expect(page.locator(".showcase-stage-phone")).toContainText("+84");
  await page.getByRole("button", { name: /change country/i }).click();
  await search.fill("wonderland");
  await page.getByRole("option", { name: /wonderland.*999/i }).click();
  await expect(page.locator(".showcase-stage-phone")).toContainText("+999");
});
test("stage country search supports keyboard selection and Escape", async ({
  page,
}) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.appEnv = "stage";
    config.disabledSelectCountry = false;
    await route.fulfill({ response, json: config });
  });
  await page.goto("/auth/login#pnv");
  const trigger = page.getByRole("button", { name: /change country/i });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const search = page.getByRole("searchbox", { name: /search country/i });
  await expect(search).toBeFocused();
  await search.fill("vietnam");
  await page.keyboard.press("Enter");
  await expect(page.locator(".showcase-stage-phone")).toContainText("+84");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "Choose country" }),
  ).toBeHidden();
});
test("stage prefix is vertically centered and country focus is visible only for keyboard", async ({
  page,
}) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.appEnv = "stage";
    config.disabledSelectCountry = false;
    await route.fulfill({ response, json: config });
  });
  await page.goto("/auth/login#pnv");
  const prefix = await page.locator(".showcase-wonderland-code").boundingBox();
  const input = await page
    .getByLabel("Phone number", { exact: true })
    .boundingBox();
  expect(
    Math.abs(prefix!.y + prefix!.height / 2 - (input!.y + input!.height / 2)),
  ).toBeLessThan(1);
  const country = page.getByRole("button", { name: /change country/i });
  await country.focus();
  await expect(page.locator(".showcase-wonderland")).toHaveCSS(
    "outline-style",
    "none",
  );
  await page.getByLabel("Phone number", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(country).toBeFocused();
  await expect(page.locator(".showcase-wonderland")).toHaveCSS(
    "outline-style",
    "solid",
  );
});
test("stage country picker is clickable on the phone flag and uses the selected prefix", async ({
  page,
}) => {
  const config = configFixture({ disabled_select_country: false });
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
    const flag = await page.locator(".showcase-wonderland-flag").boundingBox();
    expect(flag).not.toBeNull();
    const point = {
      x: flag!.x + flag!.width / 2,
      y: flag!.y + flag!.height / 2,
    };
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.id,
        point,
      ),
    ).toBe("stage-country-trigger");
    await page.mouse.click(point.x, point.y);
    const search = page.getByRole("searchbox", { name: /search country/i });
    await expect(search).toBeFocused();
    await search.fill("united states");
    await page.getByRole("option", { name: /united states.*1/i }).click();
    await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
    const request = page.waitForRequest(
      (r) => r.url().endsWith("/auth/prepare") && r.method() === "POST",
    );
    await page.getByRole("button", { name: "IP", exact: true }).click();
    expect((await request).postDataJSON().phone).toBe("12025550123");
  } finally {
    await app.stop();
    config.remove();
  }
});
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
    await expect(
      page.getByRole("button", { name: /change country/i }),
    ).toBeDisabled();
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
