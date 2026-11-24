import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("mobile exchanges submitted redirect URI, preserves userinfo precedence and creates no session", async () => {
  const provider = await startProvider();
  provider.behavior.userInfo = {
    auth_server: "provider-value",
    sub: "fixture",
  };
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const port = await freePort();
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
  });
  try {
    const response = await fetch(app.url + "/auth/mobile/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: "fixture-client",
        code: "mobile-code",
        redirect_uri: "demo://callback",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      auth_server: "provider-value",
      sub: "fixture",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(provider.calls[0].body.redirect_uri).toBe("demo://callback");
    const post = (body: Record<string, unknown>) =>
      fetch(app.url + "/auth/mobile/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    provider.calls.length = 0;
    const noServer = await post({
      client_id: "fixture-client",
      server_id: "missing",
    });
    expect(noServer.status).toBe(400);
    expect(await noServer.json()).toEqual({
      error: "Invalid server_id: 'missing'",
    });
    const noClient = await post({ client_id: "missing" });
    expect(noClient.status).toBe(401);
    expect(await noClient.json()).toEqual({ error: "Client not found" });
    expect(provider.calls).toHaveLength(0);
    provider.behavior.failAt = "token";
    const rejected = await post({
      client_id: "fixture-client",
      code: "c",
      redirect_uri: "demo://callback",
    });
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({
      error: "Request failed with status code 503",
    });
    expect(rejected.headers.get("set-cookie")).toBeNull();
    expect(provider.calls.map((call) => call.operation)).toEqual(["token"]);
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
  }
});
