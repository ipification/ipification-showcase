import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("missing Integrity configuration fails closed without disabling other flows", async () => {
  const config = configFixture();
  const app = await startApp({
    NODE_CONFIG_DIR: config.dir,
    PLAY_INTEGRITY_PACKAGE_NAME: "",
    PLAY_INTEGRITY_USER_FLOW: "",
    PLAY_INTEGRITY_STATE_SECRET: "",
    PLAY_INTEGRITY_STATE_ISSUER: "",
    PLAY_INTEGRITY_STATE_AUDIENCE: "",
  });
  try {
    expect((await fetch(app.url + "/health/ready")).status).toBe(200);
    const response = await fetch(app.url + "/api/play-integrity/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attempt_id: "attempt", integrity_token: "token" }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).decision).toBe("unavailable");
  } finally {
    await app.stop();
    config.remove();
  }
});
test("Integrity fails closed when Google credentials are unavailable", async () => {
  const provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
    play_integrity_verify_domains: [],
  });
  const port = await freePort();
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    GOOGLE_APPLICATION_CREDENTIALS:
      "/nonexistent/showcase-google-credentials.json",
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
    expect(verify.status).toBe(503);
    expect((await verify.json()).decision).toBe("unavailable");
    expect(provider.calls.filter((c) => c.operation === "token")).toHaveLength(
      0,
    );
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
  }
});
