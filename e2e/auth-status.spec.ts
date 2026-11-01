import { test, expect } from "@playwright/test";
test("reopening the pending page shows an already completed result without exchanging again", async ({
  page,
}) => {
  const response = await page.request.post("/auth/prepare", {
    data: { user_flow: "login_im", server_id: "stage", qr: false },
  });
  const attempt = await response.json();
  await page.request.get(attempt.url, { maxRedirects: 0 });
  const callback = await page.request.get(
    `/auth/callback/login_im/stage?state=${attempt.state}&code=fixture-code`,
    { maxRedirects: 0 },
  );
  const completed = await page.request.get(callback.headers().location, {
    maxRedirects: 0,
  });
  expect(completed.status()).toBe(302);
  await page.goto(`/auth/pending?state=${attempt.state}`);
  await expect(page).toHaveURL(/\/user\/info$/);
});
test("pending IM reports lost connection and recovers when status requests resume", async ({
  page,
}) => {
  const prepared = await page.request.post("/auth/prepare", {
    data: { user_flow: "login_im", server_id: "stage", qr: false },
  });
  const attempt = await prepared.json();
  await page.request.get(attempt.url, { maxRedirects: 0 });
  let offline = true;
  await page.route("**/auth/status?**", (route) =>
    offline ? route.abort() : route.continue(),
  );
  await page.goto(`/auth/pending?state=${attempt.state}`);
  await expect(page.getByText(/Connection interrupted/)).toBeVisible();
  await page.request.get(
    `/auth/callback/login_im/stage?state=${attempt.state}&code=fixture`,
    { headers: { "ip-backchannel-im-auth": "true" }, maxRedirects: 0 },
  );
  offline = false;
  await page.getByRole("button", { name: "Retry now", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/info$/);
});
