import { test, expect } from "vitest";
import { startApp } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { startProvider } from "../helpers/provider";
import { prepareAttempt } from "../helpers/auth-attempt";
import { configFixture } from "../helpers/config";

test("web attempts bind initiator/scanner, reject callback and completion replay, and permit owner recovery", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const app = await startApp({
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "state-contract:",
  });
  try {
    const attempt = await prepareAttempt(app.url, "login_ip", true);
    const owner = attempt.owner,
      scanner = attempt.callback;
    const callback =
      app.url + `/auth/callback/login_ip/stage?state=${attempt.state}&code=c`;
    const wrong = await fetch(callback, { redirect: "manual" });
    expect(wrong.headers.get("location")).toContain("AUTH_STATE_INVALID");
    expect(provider.calls).toHaveLength(0);
    const results = await Promise.all(
      [1, 2].map(() =>
        fetch(callback, { redirect: "manual", headers: { cookie: scanner } }),
      ),
    );
    expect(
      results.filter(
        (result) => result.headers.get("location") === "/auth/qrcode/complete",
      ),
    ).toHaveLength(1);
    expect(
      provider.calls.filter((call) => call.operation === "token"),
    ).toHaveLength(1);
    const status = await fetch(
      app.url + `/auth/status?state=${attempt.state}`,
      { headers: { cookie: owner } },
    );
    expect((await status.json()).status).toBe("completed");
    const unbound = await fetch(
      app.url + `/auth/complete?state=${attempt.state}`,
      { redirect: "manual", headers: { cookie: scanner } },
    );
    expect(unbound.headers.get("location")).toContain("AUTH_STATE_INVALID");
    const completions = await Promise.all(
      [1, 2].map(() =>
        fetch(app.url + `/auth/complete?state=${attempt.state}`, {
          redirect: "manual",
          headers: { cookie: owner },
        }),
      ),
    );
    expect(
      completions.filter(
        (result) => result.headers.get("location") === "/user/info",
      ),
    ).toHaveLength(1);
    // Wrong flow/server/origin and malformed/unprepared states never reach the provider.
    const isolated = await prepareAttempt(app.url, "login_ip", true);
    const count = provider.calls.length;
    for (const path of [
      `/auth/callback/pvn_ip/stage?state=${isolated.state}&code=c`,
      `/auth/callback/login_ip/stage?state=unprepared&code=c`,
      `/auth/callback/login_ip/stage?state=${isolated.state}&state=duplicate&code=c`,
    ]) {
      const response = await fetch(app.url + path, {
        redirect: "manual",
        headers: { cookie: isolated.callback },
      });
      expect(response.headers.get("location")).toContain("AUTH_STATE_INVALID");
    }
    expect(provider.calls).toHaveLength(count);
    const expiredKey = "state-contract:oauth:" + isolated.state;
    const record = JSON.parse((await redis.client.get(expiredKey))!);
    await redis.client.set(
      expiredKey,
      JSON.stringify({ ...record, expiresAt: Date.now() - 1 }),
      { PX: 60000 },
    );
    const expired = await fetch(
      app.url + `/auth/callback/login_ip/stage?state=${isolated.state}&code=c`,
      { redirect: "manual", headers: { cookie: isolated.callback } },
    );
    expect(expired.headers.get("location")).toContain("AUTH_STATE_EXPIRED");
    expect(provider.calls).toHaveLength(count);

    // A provider failure is recoverable by the QR owner, without granting a demo session.
    const failed = await prepareAttempt(app.url, "login_ip", true);
    provider.behavior.failAt = "token";
    const failure = await fetch(
      app.url + `/auth/callback/login_ip/stage?state=${failed.state}&code=c`,
      { redirect: "manual", headers: { cookie: failed.callback } },
    );
    expect(failure.headers.get("location")).toContain("/auth/error?");
    const recovered = await fetch(
      app.url + `/auth/status?state=${failed.state}`,
      { headers: { cookie: failed.owner } },
    );
    expect((await recovered.json()).status).toBe("failed");
    const failedCompletion = await fetch(
      app.url + `/auth/complete?state=${failed.state}`,
      { redirect: "manual", headers: { cookie: failed.owner } },
    );
    expect(failedCompletion.headers.get("location")).toContain("/auth/error?");
    expect(failedCompletion.headers.get("set-cookie")).toBeNull();

    // Direct navigation must carry its own initiator binding.
    const directResponse = await fetch(app.url + "/auth/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_flow: "login_ip", qr: false }),
    });
    const direct = await directResponse.json();
    const stolen = await fetch(direct.url, { redirect: "manual" });
    expect(stolen.headers.get("location")).toContain("AUTH_STATE_INVALID");
    const crossSite = await fetch(app.url + "/auth/prepare", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ user_flow: "login_ip", qr: false }),
    });
    expect(crossSite.status).toBe(400);
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});

test("QR has two minutes to scan and a separate five-minute completion window", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const app = await startApp({
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "qr-window:",
  });
  const prepare = async (qr: boolean) => {
    const before = Date.now();
    const response = await fetch(app.url + "/auth/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_flow: "login_ip", qr }),
    });
    const value = await response.json();
    return { ...value, before, cookie: response.headers.get("set-cookie")! };
  };
  try {
    const qr = await prepare(true);
    expect(qr.expiresAt - qr.before).toBeGreaterThanOrEqual(120000);
    expect(qr.expiresAt - Date.now()).toBeLessThanOrEqual(120000);
    expect(qr.cookie).toContain("Max-Age=420");
    const direct = await prepare(false);
    expect(direct.expiresAt - direct.before).toBeGreaterThanOrEqual(300000);
    expect(direct.cookie).toContain("Max-Age=300");
    const started = await fetch(qr.url, { redirect: "manual" });
    expect(started.headers.get("set-cookie")).toContain("Max-Age=300");
    const scanner = started.headers.get("set-cookie")!.split(";")[0];
    const owner = qr.cookie.split(";")[0];
    // Starting replaces the scan deadline with a fresh completion deadline.
    const key = "qr-window:oauth:" + qr.state;
    const record = JSON.parse((await redis.client.get(key))!);
    expect(record.expiresAt - Date.now()).toBeGreaterThan(290000);
    await redis.client.set(
      key,
      JSON.stringify({ ...record, scanExpiresAt: Date.now() - 1 }),
      { PX: 600000 },
    );
    const status = await fetch(app.url + `/auth/status?state=${qr.state}`, {
      headers: { cookie: owner },
    });
    const progress = await status.json();
    expect(progress.started).toBe(true);
    expect(progress.expiresAt).toBe(record.expiresAt);
    const complete = await fetch(
      app.url + `/auth/callback/login_ip/stage?state=${qr.state}&code=c`,
      { redirect: "manual", headers: { cookie: scanner } },
    );
    expect(complete.headers.get("location")).toBe("/auth/qrcode/complete");
    const expired = await prepare(true);
    const expiredKey = "qr-window:oauth:" + expired.state;
    const expiredRecord = JSON.parse((await redis.client.get(expiredKey))!);
    await redis.client.set(
      expiredKey,
      JSON.stringify({ ...expiredRecord, expiresAt: Date.now() - 1 }),
      { PX: 60000 },
    );
    const rejected = await fetch(expired.url, { redirect: "manual" });
    expect(rejected.headers.get("location")).toContain("AUTH_STATE_EXPIRED");
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
