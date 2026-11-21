import { test, expect } from "vitest";
import { startApp } from "../helpers/processes";
import { configFixture } from "../helpers/config";

test("production derives QR and provider callback origins per request behind an HTTPS ingress", async () => {
  const config = configFixture();
  let app: Awaited<ReturnType<typeof startApp>> | undefined;
  try {
    app = await startApp({
      NODE_ENV: "production",
      NODE_CONFIG_DIR: config.dir,
      TRUST_PROXY_HOPS: "1",
    });
    for (const origin of [
      "https://showcase-one.example",
      "https://showcase-two.example",
      app.url,
    ]) {
      const url = new URL(origin);
      const headers = {
        "x-forwarded-host": url.host,
        "x-forwarded-proto": url.protocol.slice(0, -1),
      };
      const publicConfig = await (
        await fetch(app.url + "/api/config", { headers })
      ).json();
      expect(publicConfig.clients[0].redirect_uri).toBe(
        origin + "/auth/callback/pvn_ip/stage",
      );
      const prepared = await fetch(app.url + "/auth/prepare", {
        method: "POST",
        headers: { ...headers, origin, "content-type": "application/json" },
        body: JSON.stringify({
          user_flow: "login_ip",
          server_id: "stage",
          qr: true,
        }),
      });
      expect(prepared.status, await prepared.clone().text()).toBe(201);
      const attempt = await prepared.json();
      expect(new URL(attempt.url).origin).toBe(origin);
      const cookie = prepared.headers.get("set-cookie")!;
      expect(cookie.includes("; Secure")).toBe(url.protocol === "https:");
      const start = await fetch(
        app.url + new URL(attempt.url).pathname + new URL(attempt.url).search,
        {
          headers,
          redirect: "manual",
        },
      );
      expect(start.status).toBe(302);
      const authorization = new URL(start.headers.get("location")!);
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        origin + "/auth/callback/login_ip/stage",
      );
      // An in-flight state cannot be moved onto another incoming domain.
      const mismatched = await fetch(
        app.url + "/auth/status?state=" + attempt.state,
        {
          headers: {
            ...headers,
            "x-forwarded-host": "different.example",
            cookie: cookie.split(";")[0],
          },
        },
      );
      expect(mismatched.status).toBe(400);
    }
  } finally {
    await app?.stop();
    config.remove();
  }
});
