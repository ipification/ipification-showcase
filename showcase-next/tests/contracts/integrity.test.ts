import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("Integrity bypass flow retains safe responses, bounded parser and single-use exchange", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
    play_integrity_verify_domains: [],
  });
  const port = await freePort();
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    REDIS_URL: redis.url,
    PLAY_INTEGRITY_ENABLED: "true",
    PLAY_INTEGRITY_PACKAGE_NAME: "com.fixture.app",
    PLAY_INTEGRITY_USER_FLOW: "pvn_ip",
    PLAY_INTEGRITY_STATE_SECRET: "fixture-state-secret",
    PLAY_INTEGRITY_STATE_ISSUER: "fixture",
    PLAY_INTEGRITY_STATE_AUDIENCE: "fixture",
  });
  const post = (path: string, body: unknown) =>
    fetch(app.url + "/api/play-integrity/" + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const bad = await post("verify", { integrity_token: "x".repeat(17000) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).reason_codes).toEqual(["INVALID_REQUEST"]);
    const attempt = await post("attempt", {
      phone_number: "+12025550123",
      server_id: "stage",
    });
    expect(attempt.status).toBe(201);
    const data = await attempt.json();
    expect(data.request_hash).toBeTruthy();
    const verify = await post("verify", {
      attempt_id: data.attempt_id,
      integrity_token: "opaque-fixture-token",
    });
    expect(verify.status).toBe(201);
    const { state } = await verify.json();
    const exchanged = await post("token-exchange", {
      state,
      code: "fixture-code",
    });
    expect(exchanged.status).toBe(200);
    expect((await exchanged.json()).decision).toBe("allow");
    expect(
      (await post("token-exchange", { state, code: "fixture-code" })).status,
    ).toBe(409);
    expect(provider.calls.filter((c) => c.operation === "token")).toHaveLength(
      1,
    );
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
