import { test, expect } from "@playwright/test";

test("mobile IP redirects with the normalized phone and a non-QR state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/auth/start?**", (route) =>
    route.fulfill({ body: "Intercepted verification navigation" }),
  );
  await page.goto("/auth/login#pnv");
  // The phone control loads asynchronously; enter digits after it is attached.
  await expect(
    page.getByRole("button", { name: /Change country for phone number/ }),
  ).toBeVisible();
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await expect(
    page.getByRole("button", { name: "IP", exact: true }),
  ).toBeEnabled();
  const request = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/auth/start",
  );
  await page.getByRole("button", { name: "IP", exact: true }).click();
  const query = new URL((await request).url()).searchParams;
  expect(query.get("user_flow")).toBe("pvn_ip");
  expect(query.get("server_id")).toBe("stage");
  expect(query.get("phone")).toBe("12025550123");
  expect(query.get("state")).toMatch(/^[0-9a-f-]{36}$/);
});

test("desktop messaging login redirects directly without attaching a phone number", async ({
  page,
}) => {
  await page.route("**/auth/start?**", (route) =>
    route.fulfill({ body: "Intercepted verification navigation" }),
  );
  await page.goto("/auth/login#login");
  const request = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/auth/start",
  );
  await page.getByRole("button", { name: "IM", exact: true }).click();
  const query = new URL((await request).url()).searchParams;
  expect(query.get("user_flow")).toBe("login_im");
  expect(query.has("phone")).toBe(false);
  expect(query.get("state")).toMatch(/^[0-9a-f-]{36}$/);
});

test("desktop identity QR distinguishes anonymous identity and KYC phone input", async ({
  page,
}) => {
  await page.goto("/auth/login#identity");
  await page
    .getByRole("button", { name: "Anonymous Identity", exact: true })
    .click();
  let query = new URL(
    (await page.getByTestId("qr-auth-link").getAttribute("href"))!,
  ).searchParams;
  expect(query.get("user_flow")).toBe("anonymous");
  expect(query.has("phone")).toBe(false);
  expect(query.get("state")).toMatch(/-qrcode$/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Phone number", { exact: true }).fill("2025550123");
  await page.getByRole("button", { name: "KYC", exact: true }).click();
  query = new URL(
    (await page.getByTestId("qr-auth-link").getAttribute("href"))!,
  ).searchParams;
  expect(query.get("user_flow")).toBe("kyc_phone");
  expect(query.get("phone")).toBe("12025550123");
  expect(query.get("state")).toMatch(/-qrcode$/);
});

test("IM pending page adopts the owner's stored backchannel result", async ({
  page,
}) => {
  const prepared = await page.request.post("/auth/prepare", {
    data: { user_flow: "login_im", server_id: "stage", qr: false },
  });
  const attempt = await prepared.json();
  await page.request.get(attempt.url, { maxRedirects: 0 });
  const backchannel = await page.request.get(
    `/auth/callback/login_im/stage?state=${attempt.state}&code=fixture`,
    { headers: { "ip-backchannel-im-auth": "true" }, maxRedirects: 0 },
  );
  expect(backchannel.status()).toBe(200);
  await page.goto(`/auth/pending?state=${attempt.state}`);
  await expect(page).toHaveURL(/\/user\/info$/);
});
