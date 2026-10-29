import { ProviderError } from "@/server/shared/errors";
import axios from "axios";
import { randomUUID } from "node:crypto";
import {
  safeProviderCode,
  type AuthFailureReason,
} from "@/shared/auth-failures";
import { json, legacyRedirect } from "@/server/http/response";
export function describeAuthFailure(error: unknown) {
  let reason: AuthFailureReason = "AUTH_FAILED";
  let stage: "token" | "userinfo" | "application" = "application";
  let status: number | undefined;
  let providerCode: string | undefined;
  if (error instanceof ProviderError || axios.isAxiosError(error)) {
    const path =
      error instanceof ProviderError
        ? undefined
        : error.config?.url?.split("?")[0];
    stage = (
      error instanceof ProviderError
        ? error.step === "userinfo"
        : path?.endsWith("/userinfo")
    )
      ? "userinfo"
      : "token";
    status =
      error instanceof ProviderError ? error.status : error.response?.status;
    const data: unknown =
      error instanceof ProviderError ? error.data : error.response?.data;
    providerCode = safeProviderCode(
      data && typeof data === "object" && "error" in data
        ? data.error
        : undefined,
    );
    if (!status || status >= 500) reason = "PROVIDER_UNAVAILABLE";
    else if (stage === "userinfo") reason = "USERINFO_FAILED";
    else if (
      providerCode === "invalid_client" ||
      providerCode === "unauthorized_client"
    )
      reason = "CLIENT_AUTH_FAILED";
    else if (providerCode === "invalid_grant") reason = "AUTH_CODE_INVALID";
    else reason = "TOKEN_REJECTED";
  }
  return { reason, stage, status, providerCode };
}
export function callbackFailure(request: Request, error: unknown) {
  const failure = describeAuthFailure(error);
  const reference = randomUUID();
  // Do not log Axios errors/config/data: these contain codes, secrets and tokens.
  console.error(
    JSON.stringify({ event: "auth_callback_failed", reference, ...failure }),
  );
  if (request.headers.get("ip-backchannel-im-auth") === "true")
    return json({ error: failure.reason, reference }, 400);
  const params = new URLSearchParams({
    reason: failure.reason,
    reference,
    stage: failure.stage,
  });
  if (failure.status) params.set("status", String(failure.status));
  if (failure.providerCode) params.set("provider_error", failure.providerCode);
  return legacyRedirect("/auth/error?" + params.toString());
}
