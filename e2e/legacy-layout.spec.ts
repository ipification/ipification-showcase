import { test, expect } from "@playwright/test";
import { startApp, freePort } from "../tests/helpers/processes";
import { configFixture } from "../tests/helpers/config";
test("legacy single-column layout and Identity content order remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/auth/login#pnv");
  const main = page.locator(".legacy-main");
  await expect(main).toBeVisible();
  expect((await main.boundingBox())!.width).toBe(580);
  await expect(page.getByText("Mobile identity", { exact: true })).toHaveCount(
    0,
  );
  const logo = page.locator(".legacy-brand-logo");
  await expect(logo).toHaveAttribute(
    "src",
    "/images/logo/ipification-horizontal-black.svg",
  );
  expect(
    await logo.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Identity", exact: true }).click();
  const anonymous = page.getByRole("button", {
    name: "Anonymous Identity",
    exact: true,
  });
  const phone = page.getByLabel("Phone number", { exact: true });
  await expect(anonymous).toBeVisible();
  await expect(phone).toBeVisible();
  expect((await anonymous.boundingBox())!.y).toBeLessThan(
    (await phone.boundingBox())!.y,
  );
  await expect(phone).toHaveCount(1);
  await page.keyboard.press("Tab");
  await phone.focus();
  await expect(phone).toHaveCSS("outline-style", "solid");
  await expect(phone).toHaveCSS("outline-width", "2px");
});
test("legacy mobile tabs and phone controls fit without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/auth/login#pnv");
  for (const name of ["Login", "Identity", "PNV"]) {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
  }
});
test("inline stage country picker still switches between Wonderland and a real country", async ({
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
    await page.getByLabel("Phone number", { exact: true }).fill("123456789");
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Country", { exact: true }).selectOption("us");
    await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Country", { exact: true }).selectOption("ww");
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.locator(".legacy-stage-phone")).toContainText("+999");
    await expect(
      page.getByRole("button", { name: "IP", exact: true }),
    ).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
    await page.screenshot({
      path: "test-results/legacy-stage-mobile.png",
      fullPage: true,
    });
  } finally {
    await app.stop();
    config.remove();
  }
});
