import { test } from "@playwright/test";
test("capture desktop and mobile migration previews", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/auth/login");
  await page.getByLabel("Phone number", { exact: true }).waitFor();
  await page.screenshot({
    path: "test-results/showcase-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/showcase-mobile.png",
    fullPage: true,
  });
});
