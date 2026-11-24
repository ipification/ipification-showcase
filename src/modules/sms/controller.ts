/** @module SMS verification */

import { sessionId } from "@/shared/server/session/cookies";
import { json, requestFailure } from "@/shared/server/http/response";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
import { cibaService } from "@/shared/server/ciba/service";
import { addApiLogContext } from "@/shared/server/common/logger";
import {
  readCibaRequest,
  startResponse,
  tokenResponse,
  operationFailure,
} from "@/shared/server/ciba/handlers";

/**
 * `POST /sms/auth` starts a provider SMS challenge.
 *
 * @param request - Send `client_id`, `server_id`, `login_hint` and `scope` as
 *   JSON. Use a normalized phone number for `login_hint`.
 * @returns On success, HTTP 200 with `auth_server`, `auth_req_id` and `nonce`.
 *   Save the request ID and nonce for {@link verifySmsCode}. Rate limiting
 *   returns 429 with `Retry-After`.
 */
export async function sendSmsCode(request: Request) {
  let context, input;
  try {
    // Parse common CIBA fields and reject requests that exceed this endpoint's rate limit.
    ({ context, input } = await readCibaRequest(request));
    addApiLogContext(request, {
      clientId: input.client_id,
      serverId: input.server_id,
      scope: input.scope,
      phone: input.login_hint,
    });
    const limit = await checkAuthLimit("sms-auth", context, input);
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    }
  } catch (error) {
    addApiLogContext(request, { result: "invalid_request" });
    return requestFailure(error);
  }
  try {
    // Ask the shared CIBA service to create the provider SMS challenge.
    const outcome = await cibaService.sendSmsCode(context, input);
    addApiLogContext(request, {
      result: outcome.kind,
      authServerId: outcome.server.id,
      ...(outcome.kind === "failure"
        ? { providerStatus: outcome.failure.status }
        : { authRequestId: outcome.authReqId }),
    });
    return startResponse(outcome);
  } catch (error) {
    addApiLogContext(request, { result: "service_unavailable" });
    return operationFailure(error, "auth");
  }
}

/**
 * `POST /sms/token` submits the user's OTP and exchanges the SMS request.
 *
 * @param request - Send `client_id`, `server_id`, `code`, `auth_req_id` and
 *   `nonce`. Reuse the values from {@link sendSmsCode} for this challenge.
 * @returns HTTP 200 with `auth_server` and provider claims on success. Check
 *   the status and claims before treating the phone as verified. The demo
 *   may create a display session for an error response.
 */
export async function verifySmsCode(request: Request) {
  let context, input;
  try {
    // Read the same challenge fields so the provider request stays tied to /sms/auth.
    ({ context, input } = await readCibaRequest(request));
    addApiLogContext(request, {
      clientId: input.client_id,
      serverId: input.server_id,
      authRequestId: input.auth_req_id,
      code: input.code,
    });
    const limit = await checkAuthLimit("sms-token", context, input);
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    }
  } catch (error) {
    addApiLogContext(request, { result: "invalid_request" });
    return requestFailure(error);
  }
  try {
    // Exchange the submitted OTP; tokenResponse also sets the Showcase result session.
    const outcome = await cibaService.verifySmsCode(
      context,
      input,
      sessionId(request),
    );
    addApiLogContext(request, {
      result: outcome.kind,
      authServerId: outcome.server.id,
      ...(outcome.kind === "failure"
        ? { providerStatus: outcome.failure.status }
        : { claimCount: Object.keys(outcome.data).length }),
    });
    return tokenResponse(outcome, context.origin);
  } catch (error) {
    addApiLogContext(request, { result: "service_unavailable" });
    return operationFailure(error, "token");
  }
}
