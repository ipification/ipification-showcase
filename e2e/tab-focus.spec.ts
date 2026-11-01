import { test, expect } from "@playwright/test";

test("restoring focus after a pointer-selected tab does not restore a surrounding outline", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const tab = page.getByRole("tab", { name: "Login", exact: true });
  await tab.click();
  await expect(tab).toHaveCSS("outline-style", "none");
  // Model the control blur/focus boundary when Chrome restores the selected page.
  await tab.evaluate((el: HTMLElement) => {
    el.blur();
    el.focus();
  });
  await expect(tab).toHaveCSS("outline-style", "none");
  await expect(tab).toHaveCSS("box-shadow", "none");
  await expect(tab).toHaveCSS("border-bottom-color", "rgb(0, 0, 0)");
});

test("keyboard users retain a visible tab focus indicator after using the mouse", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const tab = page.getByRole("tab", { name: "Login", exact: true });
  await tab.click();
  await page.keyboard.press("ArrowRight");
  const identity = page.getByRole("tab", { name: "Identity", exact: true });
  await expect(identity).toBeFocused();
  await expect(identity).toHaveCSS("outline-style", "solid");
  await expect(identity).toHaveCSS("outline-width", "2px");
});
