import { test, expect } from "vitest";
import { startProvider } from "../helpers/provider";
import { exchangeCodeAndGetUserInfo } from "@/server/shared/http-client";
import { verifySmsCode } from "@/server/ciba/provider";
import { describeAuthFailure } from "@/server/auth/failure";

for (const malformed of [
  null,
  [],
  {},
  { access_token: "" },
  { access_token: 42 },
]) {
  test(`malformed token ${JSON.stringify(malformed)} fails at token without requesting userinfo`, async () => {
    const provider = await startProvider();
    provider.behavior.tokenResponse = malformed;
    try {
      for (const exchange of [
        () =>
          exchangeCodeAndGetUserInfo(
            provider.url + "/token",
            provider.url + "/userinfo",
            { code: "fixture", client_id: "fixture", client_secret: "fixture" },
          ),
        () =>
          verifySmsCode({
            authServerUrl: provider.url,
            realm: "demo",
            clientId: "fixture",
            clientSecret: "fixture",
            authReqId: "fixture",
            smsCode: "123456",
          }),
      ]) {
        provider.calls.length = 0;
        let failure: unknown;
        try {
          await exchange();
        } catch (error) {
          failure = error;
        }
        expect(describeAuthFailure(failure)).toMatchObject({
          reason: "TOKEN_RESPONSE_INVALID",
          stage: "token",
        });
        expect(
          provider.calls.some((call) => call.operation === "userinfo"),
        ).toBe(false);
      }
    } finally {
      await provider.stop();
    }
  });
}
