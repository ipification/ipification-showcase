import { test, expect } from "@playwright/test";
test("desktop QR receives callback from independent phone browser session", async ({
  page,
  browser,
}) => {
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const link = page.getByTestId("qr-auth-link");
  const url = await link.getAttribute("href");
  expect(url).toContain("-qrcode");
  const phone = await browser.newContext();
  try {
    const phonePage = await phone.newPage();
    await phonePage.goto(url!);
    await expect(
      phonePage.getByRole("heading", { name: "Success", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/user\/info$/);
    await expect(page.locator("pre")).toContainText("browser-user");
  } finally {
    await phone.close();
  }
});
test("closed QR cannot navigate desktop on a late callback", async ({
  page,
  browser,
}) => {
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  const url = await page.getByTestId("qr-auth-link").getAttribute("href");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const phone = await browser.newContext();
  try {
    const p = await phone.newPage();
    await p.goto(url!);
    await expect(
      p.getByRole("heading", { name: "Success", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/auth\/login/);
  } finally {
    await phone.close();
  }
});
test("QR owner receives completion through HTTP polling without socket traffic", async ({
  page,
  browser,
}) => {
  const socketRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/socket.io/"))
      socketRequests.push(request.url());
  });
  page.on("websocket", (socket) => socketRequests.push(socket.url()));
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  const url = await page.getByTestId("qr-auth-link").getAttribute("href");
  const phone = await browser.newContext();
  try {
    await (await phone.newPage()).goto(url!);
    await expect(page).toHaveURL(/\/user\/info$/, { timeout: 10000 });
    expect(socketRequests).toEqual([]);
  } finally {
    await phone.close();
  }
});

test("refresh retires the old QR while preparing a replacement", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
    "href",
    /qrcode/,
  );
  await page.clock.fastForward(120001);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/prepare", async (route) => {
    await held;
    const response = await route.fetch();
    const attempt = await response.json();
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({
      response,
      json: { ...attempt, expiresAt: now + 120000 },
    });
  });
  await page
    .getByRole("button", { name: "Create new QR code", exact: true })
    .click();
  try {
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
    "href",
    /qrcode/,
  );
});

test("QR countdown uses the backend deadline and hides expired codes", async ({
  page,
}) => {
  const now = new Date();
  await page.clock.install({ time: new Date(now.getTime() - 60000) });
  await page.clock.pauseAt(now);
  await page.route("**/auth/prepare", async (route) => {
    const response = await route.fetch();
    const attempt = await response.json();
    await route.fulfill({
      response,
      json: { ...attempt, expiresAt: now.getTime() + 10000 },
    });
  });
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
    "href",
    /qrcode/,
  );
  await expect(
    page.getByText("Expires in 00:10", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(
    page.getByText("Expires in 00:04", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(4000);
  await expect(
    page.getByText("QR code expired", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("qr-auth-link")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create new QR code", exact: true }),
  ).toBeVisible();
});

test("QR scan window is two minutes and scanning switches to the completion countdown", async ({
  page,
}) => {
  const now = new Date();
  await page.clock.install({ time: new Date(now.getTime() - 60000) });
  await page.clock.pauseAt(now);
  let scanned = false;
  await page.route("**/auth/prepare", async (route) => {
    const response = await route.fetch();
    const attempt = await response.json();
    expect(attempt.expiresAt - Date.now()).toBeLessThanOrEqual(120000);
    await route.fulfill({
      response,
      json: { ...attempt, expiresAt: now.getTime() + 120000 },
    });
  });
  await page.route("**/auth/status?**", async (route) => {
    await route.fulfill({
      json: {
        status: "pending",
        started: scanned,
        expiresAt: now.getTime() + (scanned ? 419000 : 120000),
      },
    });
  });
  await page.goto("/auth/login#login");
  await page.getByRole("button", { name: "IP", exact: true }).click();
  await expect(
    page.getByText("Expires in 02:00", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(119000);
  scanned = true;
  // The fake clock is paused while the intercepted status response completes.
  // Advance polling intervals until the browser observes the scan; a single
  // fast-forward can run while an earlier request is still in flight.
  await expect
    .poll(async () => {
      await page.clock.runFor(2000);
      return page.getByText(/Verification in progress/).isVisible();
    })
    .toBe(true);
  await page.clock.fastForward(1000);
  await expect(page.getByText(/Complete verification in 04:/)).toBeVisible();
  await expect(
    page.getByText("QR code expired", { exact: true }),
  ).not.toBeVisible();
  await expect(page.getByTestId("qr-auth-link")).toHaveCount(0);
});

test("QR close has no initial focus ring and remains accessible with the keyboard", async ({
  page,
}) => {
  await page.goto("/auth/login#login");
  const trigger = page.getByRole("button", { name: "IP", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(dialog).toBeFocused();
  await expect(close).not.toBeFocused();
  await expect(close).toHaveCSS("box-shadow", "none");
  await expect(page.getByTestId("qr-auth-link")).toHaveAttribute(
    "href",
    /qrcode/,
  );
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("qr-auth-link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(close).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
});
