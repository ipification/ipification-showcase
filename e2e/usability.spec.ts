import { test, expect } from "@playwright/test";

test("phone guidance distinguishes empty and invalid input and clears after correction", async ({
  page,
}) => {
  await page.goto("/auth/login#pnv");
  const phone = page.getByLabel("Phone number", { exact: true });
  await expect(
    page.getByText("Enter a phone number to enable verification methods.", {
      exact: true,
    }),
  ).toBeVisible();
  await phone.fill("123");
  await phone.blur();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Enter a valid phone number for the selected country.", {
      exact: true,
    }),
  ).toBeVisible();
  await phone.fill("2025550123");
  await expect(phone).toHaveAttribute("aria-invalid", "false");
  await expect(
    page.getByRole("button", { name: "IP", exact: true }),
  ).toBeEnabled();
  for (const tab of ["pnv", "login", "identity"]) {
    await page.goto(`/auth/login#${tab}`);
    await expect(page.locator(".legacy-showcase")).toHaveAttribute(
      "data-tab",
      tab,
    );
    await expect(
      page.getByText("About verification methods", { exact: true }),
    ).toHaveCount(0);
  }
});

test("QR waiting timeout permits a new state and ignores the old callback", async ({
  page,
  browser,
}) => {
  await page.clock.install();
  // Advancing only the browser clock must also advance mocked server deadlines.
  await page.route("**/auth/prepare", async (route) => {
    const response = await route.fetch();
    const attempt = await response.json();
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({
      response,
      json: { ...attempt, expiresAt: now + 120000 },
    });
  });
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  const oldUrl = await page.getByTestId("qr-auth-link").getAttribute("href");
  await expect(
    page.getByText("Waiting for verification…", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(120_001);
  await expect(
    page.getByText("QR code expired", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("qr-auth-link")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create new QR code", exact: true })
    .click();
  const link = page.getByTestId("qr-auth-link");
  await expect(link).toHaveAttribute("href", /qrcode/);
  expect(await link.getAttribute("href")).not.toBe(oldUrl);
  const phone = await browser.newContext();
  try {
    await (await phone.newPage()).goto(oldUrl!);
    await expect(page).toHaveURL(/auth\/login/);
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await phone.close();
  }
});

test("status failure offers recovery without showing an unusable QR", async ({
  page,
}) => {
  await page.route("**/auth/status?**", (route) => route.abort());
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(
    page.getByText("Connection interrupted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("qr-auth-link")).toHaveCount(0);
  await page.unroute("**/auth/status?**");
  await page
    .getByRole("button", { name: "Create new QR code", exact: true })
    .click();
  await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
    "href",
    /qrcode/,
  );
});

test("results show the full userinfo immediately and copy the original JSON", async ({
  page,
  browser,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  const url = await page.getByTestId("qr-auth-link").getAttribute("href");
  const phone = await browser.newContext();
  try {
    await (await phone.newPage()).goto(url!);
  } finally {
    await phone.close();
  }
  await expect(page).toHaveURL(/\/user\/info$/);
  await expect(page.locator("pre")).toBeVisible();
  await expect(page.locator("pre")).toContainText("+12025550123");
  await expect(page.locator("pre")).toContainText("browser-user");
  await page.getByRole("button", { name: "Copy JSON", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("JSON copied");
  expect(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
  ).toEqual({
    sub: "browser-user",
    phone_number: "+12025550123",
    phone_number_verified: "true",
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy JSON", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("copy it manually");
});

test("cancelling a pending SIM credential unlocks retry and an old attempt cannot unlock the new one", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).credentialRequests = [];
    Object.defineProperty(navigator.credentials, "get", {
      configurable: true,
      value: () =>
        new Promise((resolve) =>
          (window as any).credentialRequests.push(resolve),
        ),
    });
  });
  await page.goto("/auth/login#login");
  const sim = page.getByRole("button", { name: "SIM", exact: true });
  await sim.dblclick();
  await expect
    .poll(() => page.evaluate(() => (window as any).credentialRequests.length))
    .toBe(1);
  await expect(sim).toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sim).toBeEnabled();
  await sim.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).credentialRequests.length))
    .toBe(2);
  await page.evaluate(() => (window as any).credentialRequests[0](null));
  await expect(sim).toBeDisabled();
  await expect(sim).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => (window as any).credentialRequests[1](null));
  await expect(sim).toBeEnabled();
});
