import { prepareAttempt } from "../helpers/auth-attempt";
import { test, expect } from "vitest";
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
    TRUST_PROXY_HOPS: "1",
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "cross-instance:",
    PLAY_INTEGRITY_ENABLED: "true",
    PLAY_INTEGRITY_PACKAGE_NAME: "com.fixture.app",
    PLAY_INTEGRITY_USER_FLOW: "pvn_ip",
    PLAY_INTEGRITY_STATE_SECRET: "fixture-state-secret",
    PLAY_INTEGRITY_STATE_ISSUER: "fixture",
    PLAY_INTEGRITY_STATE_AUDIENCE: "fixture",
  };
  // Both replicas see the same public host supplied by an ingress.
  function fetchInstance(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-host", `127.0.0.1:${portA}`);
    headers.set("x-forwarded-proto", "http");
    return fetch(url, { ...init, headers });
  }
  const a = await startApp({ ...env, PORT: String(portA) });
  let b = await startApp({ ...env, PORT: String(portB) });
  try {
    const attempt = await prepareAttempt(a.url, "pvn_ip", true);
    const callback = await fetchInstance(
      b.url + `/auth/callback/pvn_ip/stage?code=c&state=${attempt.state}`,
      { redirect: "manual", headers: { cookie: attempt.callback } },
    );
    expect(callback.status).toBe(302);
    // Owner status reads work on either replica, with no transport affinity.
    for (const base of [a.url, b.url]) {
      const status = await fetchInstance(
        base + `/auth/status?state=${attempt.state}`,
        {
          headers: { cookie: attempt.owner },
        },
      );
      expect(status.status).toBe(200);
      expect(await status.json()).toMatchObject({
        status: "completed",
        completionUrl: a.url + `/auth/complete?state=${attempt.state}`,
      });
      const unauthorized = await fetchInstance(
        base + `/auth/status?state=${attempt.state}`,
      );
      expect(unauthorized.status).toBe(400);
    }
    const complete = await fetchInstance(
      a.url + `/auth/complete?state=${attempt.state}`,
      {
        redirect: "manual",
        headers: { cookie: attempt.owner },
      },
    );
    const cookie = complete.headers.get("set-cookie")!.split(";")[0];
    const result = await fetchInstance(b.url + "/user/info", {
      headers: { cookie },
    });
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("+12025550123");
    expect((await fetchInstance(a.url + "/health/ready")).status).toBe(200);
    await b.stop();
    b = await startApp({ ...env, PORT: String(portB) });
    expect(
      (await fetchInstance(b.url + "/user/info", { headers: { cookie } }))
        .status,
    ).toBe(200);
    const post = (base: string, endpoint: string, body: unknown) =>
      fetchInstance(base + endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    // Results survive restart and S2S reads do not consume them.
    for (const base of [a.url, b.url, b.url]) {
      const response = await post(base, "/auth/s2s/signin", {
        state: attempt.state,
      });
      expect((await response.json()).phone_number).toBe("+12025550123");
    }
    const created = await post(a.url, "/api/play-integrity/attempt", {
      phone_number: "+12025550123",
      server_id: "stage",
    });
    expect(created.status).toBe(201);
    const integrityAttempt = await created.json();
    const verifications = await Promise.all(
      [a.url, b.url].map((base) =>
        post(base, "/api/play-integrity/verify", {
          attempt_id: integrityAttempt.attempt_id,
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
    expect((await fetchInstance(a.url + "/health/ready")).status).toBe(503);
    expect(
      (await fetchInstance(b.url + "/user/info", { headers: { cookie } }))
        .status,
    ).toBe(503);
  } finally {
    await a.stop();
    await b.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
