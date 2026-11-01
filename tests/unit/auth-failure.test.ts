import { test, expect } from "vitest";
import { AxiosError } from "axios";
import { describeAuthFailure } from "@/server/auth/failure";
import { authFailureReason, safeProviderCode } from "@/shared/auth-failures";
test.each(["ECONNREFUSED", "ETIMEDOUT"])(
  "%s offers temporary provider recovery without inventing a credential diagnosis",
  (code) => {
    expect(
      describeAuthFailure(new AxiosError("sensitive URL/code", code)),
    ).toEqual({
      reason: "PROVIDER_UNAVAILABLE",
      stage: "token",
      status: undefined,
      providerCode: undefined,
    });
  },
);
test("application failure does not expose raw exception text", () => {
  expect(describeAuthFailure(new Error("redis://user:secret@host"))).toEqual({
    reason: "AUTH_FAILED",
    stage: "application",
    status: undefined,
    providerCode: undefined,
  });
});
test("unknown provider data and inherited object keys cannot become public error codes", () => {
  expect(safeProviderCode("secret_token_value")).toBeUndefined();
  expect(authFailureReason("__proto__")).toBe("AUTH_FAILED");
  expect(authFailureReason(["CLIENT_AUTH_FAILED"])).toBe("AUTH_FAILED");
});
