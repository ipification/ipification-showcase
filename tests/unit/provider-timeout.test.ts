import { test, expect, vi } from "vitest";
import { startProvider } from "../helpers/provider";
import { exchangeCodeAndGetUserInfo } from "@/server/shared/http-client";
import {
  sendSmsCode,
  verifySmsCode,
  createSimCredentialRequest,
} from "@/server/ciba/provider";
import { describeAuthFailure } from "@/server/auth/failure";
const credentials = {
  realm: "demo",
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
};
for (const operation of ["token", "userinfo", "auth", "dcql"] as const) {
  test(`provider ${operation} is bounded without retries or leaking request data`, async () => {
    vi.stubEnv("PROVIDER_HTTP_TIMEOUT_MS", "40");
    const provider = await startProvider();
    provider.behavior.delays[operation] = 180;
    try {
      const request =
        operation === "auth"
          ? sendSmsCode({ ...credentials, authServerUrl: provider.url })
          : operation === "dcql"
            ? createSimCredentialRequest({
                ...credentials,
                authServerUrl: provider.url,
              })
            : exchangeCodeAndGetUserInfo(
                provider.url + "/token",
                provider.url + "/userinfo",
                { code: "PRIVATE_CODE", client_secret: "PRIVATE_SECRET" },
              );
      await expect(request).rejects.toMatchObject({ timedOut: true });
      const failure = await request.catch((error) => error);
      expect(describeAuthFailure(failure).reason).toBe("PROVIDER_TIMEOUT");
      expect(failure.message).toBe(
        "Authentication provider did not respond in time.",
      );
      expect(JSON.stringify(describeAuthFailure(failure))).not.toMatch(
        /PRIVATE_CODE|PRIVATE_SECRET|fixture-secret/,
      );
      expect(
        provider.calls.filter((call) => call.operation === operation),
      ).toHaveLength(1);
      if (operation === "token")
        expect(
          provider.calls.some((call) => call.operation === "userinfo"),
        ).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      await provider.stop();
    }
  });
}
test("CIBA callback timeout stays best-effort, then token and userinfo run once", async () => {
  vi.stubEnv("PROVIDER_HTTP_TIMEOUT_MS", "40");
  const provider = await startProvider();
  provider.behavior.delays.callback = 180;
  try {
    await expect(
      verifySmsCode({
        ...credentials,
        authServerUrl: provider.url,
        authReqId: "fixture",
        smsCode: "123456",
      }),
    ).resolves.toEqual(provider.behavior.userInfo);
    expect(provider.calls.map((call) => call.operation)).toEqual([
      "callback",
      "token",
      "userinfo",
    ]);
    // Token/userinfo must finish before the stalled callback responds.
    expect(provider.responded).not.toContain("callback");
  } finally {
    vi.unstubAllEnvs();
    await provider.stop();
  }
});
