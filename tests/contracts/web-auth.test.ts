import { prepareAttempt } from "../helpers/auth-attempt";
import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("web callbacks retain 302, QR/backchannel order, independent session and S2S results", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const port = await freePort(),
    origin = `http://127.0.0.1:${port}`;
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
  });
  const get = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { redirect: "manual", ...options });
  try {
    const attempt = await prepareAttempt(origin);
    const start = attempt.start;
    expect(start.status).toBe(302);
    expect(
      new URL(start.headers.get("location")!).searchParams.get("redirect_uri"),
    ).toBe(origin + "/auth/callback/pvn_ip/stage");
    const cb = await get(
      `/auth/callback/pvn_ip/stage?code=fixture-code&state=${attempt.state}`,
      { headers: { cookie: attempt.callback } },
    );
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe(
      origin + `/auth/complete?state=${attempt.state}`,
    );
    expect(provider.calls.map((c) => c.operation)).toEqual([
      "token",
      "userinfo",
    ]);
    const complete = await get(`/auth/complete?state=${attempt.state}`, {
      headers: { cookie: attempt.owner },
    });
    expect(complete.status).toBe(302);
    expect(complete.headers.get("location")).toBe("/user/info");
    const cookie = complete.headers.get("set-cookie")!.split(";")[0];
    expect((await get("/user/info", { headers: { cookie } })).status).toBe(200);
    const anonymous = await get("/user/info");
    expect(anonymous.status, anonymous.status === 302 ? "" : app.output()).toBe(
      302,
    );
    expect(anonymous.headers.get("location")).toBe("/");
    const s2s = await get("/auth/s2s/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: attempt.state }),
    });
    expect(s2s.status).toBe(200);
    expect(await s2s.json()).toEqual(provider.behavior.userInfo);
    expect(s2s.headers.get("set-cookie")).toBeNull();
    const repeat = await get("/auth/s2s/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: attempt.state }),
    });
    expect(await repeat.json()).toEqual(provider.behavior.userInfo);
    const missing = await get("/auth/s2s/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "missing" }),
    });
    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("");
    const pendingIm = await prepareAttempt(origin, "login_im");
    provider.behavior.tokenDelay = 500;
    const inFlight = get(
      `/auth/callback/login_im/stage?code=c&state=${pendingIm.state}`,
      { headers: { "ip-backchannel-im-auth": "true" } },
    );
    for (
      let i = 0;
      i < 100 &&
      provider.calls.filter((c) => c.operation === "token").length < 2;
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    const pendingReturn = await get(
      `/auth/callback/login_im/stage?code=c&state=${pendingIm.state}`,
      { headers: { cookie: pendingIm.callback } },
    );
    expect(pendingReturn.headers.get("location")).toBe(
      `/auth/pending?state=${pendingIm.state}`,
    );
    expect(pendingReturn.headers.get("set-cookie")).toBeNull();
    expect((await inFlight).status).toBe(200);
    provider.behavior.tokenDelay = 0;
    const im = await prepareAttempt(origin, "login_im");
    const back = await get(
      `/auth/callback/login_im/stage?code=c&state=${im.state}`,
      { headers: { "ip-backchannel-im-auth": "true" } },
    );
    expect(back.status).toBe(200);
    expect(await back.text()).toBe("");
    expect(back.headers.get("set-cookie")).toBeNull();
    const resumed = await get(
      `/auth/callback/login_im/stage?code=c&state=${im.state}`,
      { headers: { cookie: im.callback } },
    );
    expect(resumed.headers.get("location")).toBe(
      origin + `/auth/complete?state=${im.state}`,
    );
    const qr = await prepareAttempt(origin, "pvn_ip", true);
    provider.behavior.userInfo = {
      sub: "fixture-subject",
      phone_number_verified: "false",
    };
    expect(
      (
        await get(`/auth/callback/pvn_ip/stage?code=c&state=${qr.state}`, {
          headers: { cookie: qr.callback },
        })
      ).headers.get("location"),
    ).toBe("/auth/qrcode/error");
    const qr2 = await prepareAttempt(origin, "pvn_ip", true);
    provider.behavior.userInfo = {
      sub: "fixture-subject",
      phone_number_verified: false,
    };
    expect(
      (
        await get(`/auth/callback/pvn_ip/stage?code=c&state=${qr2.state}`, {
          headers: { cookie: qr2.callback },
        })
      ).headers.get("location"),
    ).toBe("/auth/qrcode/complete");
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});

test("callback errors reach the bound browser sessions without exposing them in redirects", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const port = await freePort(),
    origin = `http://127.0.0.1:${port}`;
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
  });
  const get = (path: string, cookie?: string) =>
    fetch(origin + path, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
  const sessionCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith("showcase_next_sid="))!
      .split(";")[0];
  try {
    for (const [params, expected] of [
      [
        {
          error: "msisdn_country_mismatch",
          error_description: "Country mismatch",
          code: "ignored",
        },
        "msisdn_country_mismatch",
      ],
      [
        { error_description: "Provider could not verify this number" },
        "Provider could not verify this number",
      ],
      [
        {
          error_description:
            "Failed code=secret Bearer token https://example.com/private",
        },
        "Failed [sensitive data removed] [sensitive data removed] [link removed]",
      ],
      [{}, "Unable to complete authentication."],
    ] as Array<[Record<string, string>, string]>) {
      const attempt = await prepareAttempt(origin);
      const query = new URLSearchParams({ state: attempt.state, ...params });
      const callback = await get(
        `/auth/callback/pvn_ip/stage?${query}`,
        attempt.callback,
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe("/auth/login");
      const cookie = sessionCookie(callback);
      const error = await get("/auth/login/error", cookie);
      expect((await error.json()).error_message).toBe(expected);
      const consumed = await get("/auth/login/error", cookie);
      expect((await consumed.json()).error_message).toBeNull();
    }
    const qr = await prepareAttempt(origin, "pvn_ip", true);
    const query = new URLSearchParams({
      state: qr.state,
      error: "msisdn_country_mismatch",
    });
    const callback = await get(
      `/auth/callback/pvn_ip/stage?${query}`,
      qr.callback,
    );
    expect(callback.headers.get("location")).toBe("/auth/qrcode/error");
    const scannerPage = await get(
      "/auth/qrcode/error",
      sessionCookie(callback),
    );
    expect(await scannerPage.text()).toContain("msisdn_country_mismatch");
    const status = await get(`/auth/status?state=${qr.state}`, qr.owner);
    const statusBody = await status.json();
    expect(statusBody.status).toBe("failed");
    const complete = await get(`/auth/complete?state=${qr.state}`, qr.owner);
    expect(complete.headers.get("location")).toBe("/auth/login");
    const ownerError = await get("/auth/login/error", sessionCookie(complete));
    expect((await ownerError.json()).error_message).toBe(
      "msisdn_country_mismatch",
    );
    expect(provider.calls).toEqual([]);
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
