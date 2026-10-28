import { test, expect } from "vitest";
import { io } from "socket.io-client";
import { startApp, freePort } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("production instances share callbacks, sessions across restart, and single-use Integrity claims", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const portA = await freePort(),
    portB = await freePort();
  const env = {
    NODE_ENV: "production",
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${portA}`,
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "cross-instance:",
    PLAY_INTEGRITY_ENABLED: "true",
    PLAY_INTEGRITY_PACKAGE_NAME: "com.fixture.app",
    PLAY_INTEGRITY_USER_FLOW: "pvn_ip",
    PLAY_INTEGRITY_STATE_SECRET: "fixture-state-secret",
    PLAY_INTEGRITY_STATE_ISSUER: "fixture",
    PLAY_INTEGRITY_STATE_AUDIENCE: "fixture",
  };
  const a = await startApp({ ...env, PORT: String(portA) });
  let b = await startApp({ ...env, PORT: String(portB) });
  const client = io(a.url, { transports: ["websocket"] });
  try {
    await new Promise<void>((r) => client.on("connect", () => r()));
    await new Promise<void>((r) =>
      client.emit("init", { state: "cross-qrcode" }, () => r()),
    );
    const notification = new Promise<any>((r) =>
      client.on("messages", (m) => {
        if (m.event_name === "url") r(m);
      }),
    );
    const callback = await fetch(
      b.url + "/auth/callback/pvn_ip/stage?code=c&state=cross-qrcode",
      { redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect((await notification).url).toBe(
      a.url + "/auth/complete?state=cross-qrcode",
    );
    const complete = await fetch(a.url + "/auth/complete?state=cross-qrcode", {
      redirect: "manual",
    });
    const cookie = complete.headers.get("set-cookie")!.split(";")[0];
    const result = await fetch(b.url + "/user/info", { headers: { cookie } });
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("+12025550123");
    expect((await fetch(a.url + "/health/ready")).status).toBe(200);
    await b.stop();
    b = await startApp({ ...env, PORT: String(portB) });
    expect(
      (await fetch(b.url + "/user/info", { headers: { cookie } })).status,
    ).toBe(200);
    const post = (base: string, endpoint: string, body: unknown) =>
      fetch(base + endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    // Results survive restart and S2S reads do not consume them.
    for (const base of [a.url, b.url, b.url]) {
      const response = await post(base, "/auth/s2s/signin", {
        state: "cross-qrcode",
      });
      expect((await response.json()).phone_number).toBe("+12025550123");
    }
    const created = await post(a.url, "/api/play-integrity/attempt", {
      phone_number: "+12025550123",
      server_id: "stage",
    });
    expect(created.status).toBe(201);
    const attempt = await created.json();
    const verifications = await Promise.all(
      [a.url, b.url].map((base) =>
        post(base, "/api/play-integrity/verify", {
          attempt_id: attempt.attempt_id,
          integrity_token: "fixture-token",
        }),
      ),
    );
    expect(verifications.map((r) => r.status).sort()).toEqual([201, 409]);
    const { state } = await verifications.find((r) => r.status === 201)!.json();
    const exchanges = await Promise.all(
      [a.url, b.url].map((base) =>
        post(base, "/api/play-integrity/token-exchange", {
          state,
          code: "fixture-code",
        }),
      ),
    );
    expect(exchanges.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(provider.calls.filter((c) => c.operation === "token")).toHaveLength(
      2,
    );
    // A lost store must fail readiness/auth closed rather than create process-local sessions.
    await redis.stop();
    expect((await fetch(a.url + "/health/ready")).status).toBe(503);
    expect(
      (await fetch(b.url + "/user/info", { headers: { cookie } })).status,
    ).toBe(503);
  } finally {
    client.disconnect();
    await a.stop();
    await b.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
