/** @module SMS verification */

import { sessionId } from "@/shared/server/session/cookies";
import { json, requestFailure } from "@/shared/server/http/response";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
import { cibaService } from "@/shared/server/ciba/service";
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
    const limit = await checkAuthLimit("sms-auth", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
  } catch (error) {
    return requestFailure(error);
  }
  try {
    // Ask the shared CIBA service to create the provider SMS challenge.
    const outcome = await cibaService.sendSmsCode(context, input);
    return startResponse(outcome);
  } catch (error) {
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
    const limit = await checkAuthLimit("sms-token", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
  } catch (error) {
    return requestFailure(error);
  }
  try {
    // Exchange the submitted OTP; tokenResponse also sets the Showcase result session.
    const outcome = await cibaService.verifySmsCode(
      context,
      input,
      sessionId(request),
    );
    return tokenResponse(outcome, context.origin);
  } catch (error) {
    return operationFailure(error, "token");
  }
}
