import {
  ProviderError,
  InvalidTokenResponseError,
  AuthAttemptError,
} from "@/shared/server/common/errors";
import axios from "axios";
import { randomUUID } from "node:crypto";
import {
  safeProviderCode,
  type AuthFailureReason,
} from "@/shared/auth-failures";
import { json, legacyRedirect } from "@/shared/server/http/response";
import { logger } from "@/shared/server/common/logger";
/**
 * Maps an internal or provider error to safe fields for logs and the error page.
 *
 * @param error - The thrown error from callback validation or provider exchange.
 * @returns A stable reason and stage, with optional HTTP status and safe provider code.
 */
export function describeAuthFailure(error: unknown) {
  // Convert internal/provider errors to a small safe shape; never expose raw payloads.
  if (error instanceof AuthAttemptError)
    return {
      reason: error.reason,
      stage: error.stage,
      status: error.status,
      providerCode: error.providerCode,
    };
  if (error instanceof InvalidTokenResponseError)
    return {
      reason: "TOKEN_RESPONSE_INVALID" as const,
      stage: "token" as const,
      status: undefined,
      providerCode: undefined,
    };
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
    if (error instanceof ProviderError && error.timedOut)
      reason = "PROVIDER_TIMEOUT";
    else if (!status || status >= 500) reason = "PROVIDER_UNAVAILABLE";
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
/**
 * Logs a callback failure and returns the browser or backchannel response.
 *
 * @param request - Callback request; its backchannel header selects the response format.
 * @param error - The error to summarize without exposing raw provider data.
 * @returns HTTP 400 JSON for backchannel calls or a redirect to the Showcase error page.
 */
export function callbackFailure(request: Request, error: unknown) {
  // Give support a reference ID while returning only safe error details to the caller.
  const failure = describeAuthFailure(error);
  const reference = randomUUID();
  // Do not log Axios errors/config/data: these contain codes, secrets and tokens.
  logger.error(
    { event: "auth_callback_failed", reference, ...failure },
    "Authentication callback failed",
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
