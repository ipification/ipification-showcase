import { test, expect } from "vitest";
import { ProviderError, providerFailure } from "@/server/shared/errors";
import { describeAuthFailure } from "@/server/auth/failure";
test("provider failures expose one typed envelope with explicit step and preserve endpoint-specific presentation", () => {
  const error = new ProviderError("token", {
    message: "Request failed with status code 401",
    response: {
      status: 401,
      data: { error: "invalid_client", error_description: "private" },
    },
  });
  expect(providerFailure(error)).toEqual({
    message: "Request failed with status code 401",
    status: 401,
    data: { error: "invalid_client", error_description: "private" },
  });
  expect(describeAuthFailure(error)).toEqual({
    reason: "CLIENT_AUTH_FAILED",
    stage: "token",
    status: 401,
    providerCode: "invalid_client",
  });
  expect(
    describeAuthFailure(
      new ProviderError("userinfo", {
        message: "failed",
        response: { status: 401 },
      }),
    ),
  ).toMatchObject({ reason: "USERINFO_FAILED", stage: "userinfo" });
  expect(
    describeAuthFailure(new ProviderError("token", new Error("timeout"))),
  ).toMatchObject({ reason: "PROVIDER_UNAVAILABLE", status: undefined });
});
