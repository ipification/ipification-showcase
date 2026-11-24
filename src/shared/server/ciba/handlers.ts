import { resolveContext } from "@/shared/server/http/context";
import { readBody } from "@/shared/server/http/body";
import {
  json,
  text,
  unavailable,
  requestFailure,
} from "@/shared/server/http/response";
import { setSessionCookie } from "@/shared/server/session/cookies";
import { ApplicationError } from "@/shared/server/common/errors";
import {
  failureData,
  type StartOutcome,
  type TokenOutcome,
} from "./service";
import { decodeCiba } from "./input";
import { addApiLogContext } from "@/shared/server/common/logger";

/**
 * Reads request-specific context and the common SMS/SIM input fields.
 *
 * @param request - Incoming JSON or form-encoded HTTP request.
 * @returns Resolved app context and decoded CIBA input.
 * @throws A request/context error when body parsing or configuration fails.
 */
export async function readCibaRequest(request: Request) {
  // Resolve request-specific config and decode the shared CIBA wire fields once.
  const context = resolveContext(request);
  const input = decodeCiba(await readBody(request));
  return { context, input };
}

/**
 * Converts a CIBA start result to the endpoint's challenge response envelope.
 *
 * @param outcome - Provider challenge data or normalized failure.
 * @param headers - Optional response headers such as `Retry-After`.
 * @returns HTTP 200 challenge details or the provider failure status/details.
 */
export function startResponse(
  outcome: StartOutcome,
  headers: Record<string, string> = {},
) {
  // Keep provider failures in the established error envelope; success returns challenge details.
  if (outcome.kind === "failure")
    return json(
      {
        auth_server: outcome.server,
        success: false,
        ...failureData(outcome.failure),
      },
      outcome.failure.status,
      headers,
    );
  return json(
    {
      auth_server: outcome.server,
      auth_req_id: outcome.authReqId,
      nonce: outcome.nonce,
      ...("digitalRequest" in outcome
        ? { digital_request: outcome.digitalRequest }
        : {}),
    },
    200,
    headers,
  );
}

/**
 * Converts an exchange result to JSON and attaches its Showcase session cookie.
 *
 * @param outcome - Provider claims or normalized error data with a display-session ID.
 * @param origin - Request origin used to configure the cookie.
 * @returns JSON response carrying the session cookie.
 */
export function tokenResponse(outcome: TokenOutcome, origin: string) {
  // Return exchanged claims or provider error details and attach the display-session cookie.
  return setSessionCookie(
    outcome.kind === "failure"
      ? json(failureData(outcome.failure), outcome.failure.status)
      : json({ auth_server: outcome.server, ...outcome.data }),
    outcome.sessionId,
    origin,
  );
}

/**
 * Maps config/provider exceptions to the established start or token response.
 *
 * @param error - Exception from config resolution or provider operations.
 * @param operation - `auth` for challenge creation or `token` for exchange.
 * @returns Client error details or HTTP 503 for an unavailable service.
 */
export function operationFailure(error: unknown, operation: "auth" | "token") {
  // Preserve the historical response shape for each endpoint type.
  if (error instanceof ApplicationError) {
    if (error.code === "SERVER_NOT_FOUND")
      return json(
        {
          error: error.input
            ? `Invalid server_id: '${error.input}'`
            : "No auth servers configured",
        },
        400,
      );
    // Keep the existing text response for auth and JSON response for token.
    return operation === "auth"
      ? text("Client not found", 401)
      : json({ error: "Client not found" }, 401);
  }
  return unavailable();
}

/**
 * Acknowledges a diagnostic payload without storing or returning its contents.
 *
 * @param request - Diagnostic HTTP request.
 * @returns Plain-text `OK`, or the standard request failure response.
 */
export async function diagnostics(request: Request) {
  try {
    const payload = await readBody(request);
    addApiLogContext(request, {
      result: "diagnostic_received",
      payloadFields: Object.keys(payload),
    });
    return text("OK");
  } catch (error) {
    addApiLogContext(request, { result: "invalid_diagnostic_request" });
    return requestFailure(error);
  }
}
