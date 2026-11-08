import { test, expect } from "vitest";
import { startApp, freePort } from "../helpers/processes";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("CIBA endpoints preserve provider order, token error sessions and protocol payloads", async () => {
  const provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const port = await freePort();
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
  });
  const post = (path: string, body: unknown) =>
    fetch(app.url + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    for (const protocol of ["sms", "ts43"]) {
      provider.calls.length = 0;
      const auth = await post(`/${protocol}/auth`, {
        client_id: "fixture-client",
        login_hint: "12025550123",
        server_id: "stage",
        carrier_hint: 51010,
      });
      expect(auth.status).toBe(200);
      const body = await auth.json();
      expect(body.auth_req_id).toBe("fixture-auth-id");
      expect(body.nonce).toMatch(/^[a-f0-9-]{36}$/);
      expect(provider.calls.map((call) => call.operation)).toEqual(
        protocol === "sms" ? ["auth"] : ["auth", "dcql"],
      );
      expect(provider.calls[0].body).toMatchObject({
        client_id: "fixture-client",
        scope: "openid ip:phone_verify",
        login_hint: "12025550123",
      });
      if (protocol === "sms") {
        expect(provider.calls[0].body.channel).toBe("sms");
        expect(provider.calls[0].body.message).toBe(
          "Your verification PIN is: {{code}}",
        );
        expect(provider.calls[0].body.carrier_hint).toBeUndefined();
      } else {
        expect(body.digital_request.protocol).toBe("openid4vp-v1-unsigned");
        expect(provider.calls[0].body.carrier_hint).toBe("51010");
        expect(provider.calls[1].body).toEqual({
          operation: "VerifyPhoneNumber",
          nonce: body.nonce,
        });
      }
      provider.calls.length = 0;
      provider.behavior.failAt = "callback";
      const token = await post(`/${protocol}/token`, {
        client_id: "fixture-client",
        auth_req_id: body.auth_req_id,
        nonce: body.nonce,
        code: "123456",
        vp_token: "fixture-vp",
      });
      expect(token.status).toBe(200);
      expect(provider.calls.map((c) => c.operation)).toEqual([
        "callback",
        "token",
        "userinfo",
      ]);
      expect(token.headers.get("set-cookie")).toContain("showcase_next_sid=");
      expect(provider.calls[0].path).toBe(
        `/realms/demo/protocol/openid-connect/ext/bc/${protocol}/callback`,
      );
      expect(provider.calls[0].body).toEqual(
        protocol === "sms" ? { code: "123456" } : { vp_token: "fixture-vp" },
      );
      expect(provider.calls[1].body).toMatchObject({
        auth_req_id: "fixture-auth-id",
        grant_type: "urn:openid:params:grant-type:ciba",
      });
      expect(provider.calls[2].body).toEqual({ access_token: "fixture-token" });
      provider.behavior.failAt = "token";
      const fail = await post(`/${protocol}/token`, {
        client_id: "fixture-client",
        auth_req_id: "a",
      });
      expect(fail.status).toBe(503);
      expect(fail.headers.get("set-cookie")).toContain("showcase_next_sid=");
      provider.behavior.failAt = "";
    }
  } finally {
    await app.stop();
    config.remove();
    await provider.stop();
  }
});
