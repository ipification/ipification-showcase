import { test, expect } from "@playwright/test";
test("phone verification validates input and works at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  await expect(phone).toBeVisible();
  await phone.fill("2025550123");
  await expect(
    page.getByRole("button", { name: "IP", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("short digit input remains editable and enables methods; validation runs on activation", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  const ip = page.getByRole("button", { name: "IP", exact: true });
  await expect(ip).toBeDisabled();
  await phone.pressSequentially("1");
  await expect(phone).toHaveValue("1");
  await expect(ip).toBeEnabled();
  await phone.pressSequentially("23456789");
  expect((await phone.inputValue()).replace(/\D/g, "")).toBe("123456789");
  await phone.fill("1");
  let prepares = 0;
  await page.route("**/auth/prepare", (route) => {
    prepares++;
    return route.abort();
  });
  await ip.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your phone is invalid" }),
  ).toBeVisible();
  expect(prepares).toBe(0);
  await phone.fill("");
  await expect(ip).toBeDisabled();
});

test("phone input does not truncate a typed digit sequence at the country's valid length", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  await phone.pressSequentially("123456789123456789");
  expect((await phone.inputValue()).replace(/\D/g, "")).toBe(
    "123456789123456789",
  );
});

test("Serbia +381 accepts the ninth typed digit", async ({ page }) => {
  await page.goto("/auth/login#pnv");
  await page
    .getByRole("button", { name: /Change country for phone number/ })
    .click();
  await page
    .getByRole("combobox", { name: "Search", exact: true })
    .fill("Serbia");
  await page
    .getByRole("option", { name: "Serbia (+381)", exact: true })
    .click();
  const phone = page.getByLabel("Phone number", { exact: true });
  await phone.pressSequentially("12345678");
  await expect(phone).toHaveValue("12345678");
  await phone.pressSequentially("9");
  await expect(phone).toHaveValue("123456789");
  await page.screenshot({
    path: "test-results/phone-serbia-nine-digits.png",
    fullPage: true,
  });
});

test("phone input has no surrounding outline for pointer entry and retains keyboard focus indication", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  await phone.click();
  await phone.pressSequentially("123456789");
  await expect(phone).toHaveCSS("outline-style", "none");
  await expect(phone).toHaveCSS("box-shadow", "none");
  await phone.press("ArrowLeft");
  await expect(phone).toHaveCSS("outline-style", "none");
  await phone.evaluate((input: HTMLInputElement) => {
    input.blur();
    input.focus();
  });
  await expect(phone).toHaveCSS("outline-style", "none");
  await phone.press("Tab");
  await phone.focus();
  await expect(phone).toHaveCSS("outline-style", "solid");
  await expect(phone).toHaveCSS("outline-width", "2px");
});
