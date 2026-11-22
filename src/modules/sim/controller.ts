/** @module SIM verification */

import { sessionId } from "@/shared/server/session/cookies";
import { requestFailure } from "@/shared/server/http/response";
import { cibaService } from "@/shared/server/ciba/service";
import {
  readCibaRequest,
  startResponse,
  tokenResponse,
  operationFailure,
} from "@/shared/server/ciba/handlers";
import { json } from "@/shared/server/http/response";
import {
  checkTs43Limit,
  checkAuthLimit,
} from "@/shared/server/storage/rate-limit";

/**
 * `POST /ts43/auth` prepares a SIM credential request.
 *
 * @param request - Send `client_id`, `server_id`, `login_hint`, `carrier_hint`,
 *   `scope`, and the flow-specific `operation` when applicable.
 * @returns HTTP 200 with `auth_server`, `auth_req_id`, `nonce` and
 *   `digital_request` on success. Pass the digital request to a browser that
 *   supports the SIM credential protocol. Rate limiting returns 429.
 */
export async function createSimCredentialRequest(request: Request) {
  let context,
    input,
    headers: Record<string, string> = {};
  try {
    ({ context, input } = await readCibaRequest(request));
    // Limit before resolving the client/server, as required by this endpoint.
    const limit = await checkTs43Limit(context, input);
    headers = limit.headers;
    if (!limit.allowed) return json({ error: "RATE_LIMITED" }, 429, headers);
  } catch (error) {
    return requestFailure(error);
  }
  try {
    const outcome = await cibaService.createSimCredentialRequest(
      context,
      input,
    );
    return startResponse(outcome, headers);
  } catch (error) {
    return operationFailure(error, "auth");
  }
}

/**
 * `POST /ts43/token` exchanges the browser's SIM credential for provider claims.
 *
 * @param request - Send `vp_token`, `client_id`, `server_id`, `auth_req_id`
 *   and `nonce` for the request from {@link createSimCredentialRequest}.
 * @returns HTTP 200 with `auth_server` and provider claims on success. Inspect
 *   the response status and claims before treating the SIM as verified.
 */
export async function exchangeSimCredential(request: Request) {
  let context, input;
  try {
    ({ context, input } = await readCibaRequest(request));
    const limit = await checkAuthLimit("sim-token", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
  } catch (error) {
    return requestFailure(error);
  }
  try {
    const outcome = await cibaService.exchangeSimCredential(
      context,
      input,
      sessionId(request),
    );
    return tokenResponse(outcome, context.origin);
  } catch (error) {
    return operationFailure(error, "token");
  }
}
