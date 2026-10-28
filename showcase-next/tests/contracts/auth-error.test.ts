import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { configFixture } from "../helpers/config";
import { startProvider } from "../helpers/provider";
import { startRedis } from "../helpers/redis";

test("callback failures show safe actionable screens and retain machine-readable backchannel failure", async () => {
  const provider = await startProvider();
  const redis = await startRedis();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const port = await freePort();
  const app = await startApp({
    NODE_ENV: "production",
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "friendly-error-test:",
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
  });
  const cases = [
    [
      "token",
      401,
      "invalid_client",
      "CLIENT_AUTH_FAILED",
      "Check the client credentials",
    ],
    ["token", 400, "invalid_grant", "AUTH_CODE_INVALID", "Start a new login"],
    [
      "token",
      401,
      "unrecognized-sensitive-error",
      "TOKEN_REJECTED",
      "rejected the token request",
    ],
    [
      "userinfo",
      401,
      "invalid_token",
      "USERINFO_FAILED",
      "could not load your profile",
    ],
    [
      "token",
      503,
      "server_error",
      "PROVIDER_UNAVAILABLE",
      "temporarily unavailable",
    ],
  ] as const;
  try {
    for (const [
      operation,
      status,
      providerCode,
      reason,
      explanation,
    ] of cases) {
      provider.behavior.failAt = operation;
      provider.behavior.failStatus = status;
      provider.behavior.failBody = {
        error: providerCode,
        error_description:
          "RAW_PRIVATE_PROVIDER_TEXT fixture-secret <script>alert(1)</script>",
      };
      const response = await fetch(
        app.url +
          "/auth/callback/pvn_ip/stage?code=PRIVATE_AUTH_CODE&state=failed-qrcode",
        { redirect: "manual" },
      );
      expect(response.status).toBe(302);
      const destination = new URL(response.headers.get("location")!, app.url);
      expect(destination.pathname).toBe("/auth/error");
      expect(destination.searchParams.get("reason")).toBe(reason);
      expect(destination.searchParams.get("reference")).toMatch(
        /^[0-9a-f-]{36}$/,
      );
      const html = await (await fetch(destination)).text();
      expect(html).toContain(explanation);
      expect(html).toContain("Try again");
      expect(html).toContain(destination.searchParams.get("reference")!);
      expect(html).not.toContain("PRIVATE_AUTH_CODE");
      expect(html).not.toContain("RAW_PRIVATE_PROVIDER_TEXT");
      expect(html).not.toContain("fixture-secret");
      expect(destination.href).not.toContain("unrecognized-sensitive-error");
    }
    const backchannel = await fetch(
      app.url + "/auth/callback/pvn_ip/stage?code=c&state=s",
      { headers: { "ip-backchannel-im-auth": "true" }, redirect: "manual" },
    );
    expect(backchannel.status).toBe(400);
    expect((await backchannel.json()).error).toBe("PROVIDER_UNAVAILABLE");
    provider.behavior.failAt = "";
    const success = await fetch(
      app.url + "/auth/callback/pvn_ip/stage?code=fresh-fixture&state=success",
      { redirect: "manual" },
    );
    expect(success.status).toBe(302);
    expect(success.headers.get("location")).toBe(
      app.url + "/auth/complete?state=success",
    );
    const completion = await fetch(success.headers.get("location")!, {
      redirect: "manual",
    });
    expect(completion.headers.get("location")).toBe("/user/info");
    const unknown = await (
      await fetch(
        app.url + "/auth/error?reason=%3Cscript%3E&reference=PRIVATE_AUTH_CODE",
      )
    ).text();
    expect(unknown).toContain("Unable to complete authentication");
    // Next serializes URL search params into its router payload; only rendered diagnostics are filtered here.
    expect(unknown.match(/<main[\s\S]*?<\/main>/)?.[0]).not.toContain(
      "PRIVATE_AUTH_CODE",
    );
    expect(app.output()).toContain('"event":"auth_callback_failed"');
    expect(app.output()).not.toContain("RAW_PRIVATE_PROVIDER_TEXT");
    expect(app.output()).not.toContain("fixture-secret");
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
