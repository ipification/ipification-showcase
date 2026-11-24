/** @module SIM verification */

import { sessionId } from "@/shared/server/session/cookies";
import { json, requestFailure } from "@/shared/server/http/response";
import { cibaService } from "@/shared/server/ciba/service";
import {
  readCibaRequest,
  startResponse,
  tokenResponse,
  operationFailure,
} from "@/shared/server/ciba/handlers";
import {
  checkTs43Limit,
  checkAuthLimit,
} from "@/shared/server/storage/rate-limit";
import { addApiLogContext } from "@/shared/server/common/logger";

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
    // Parse the SIM request before applying the TS43-specific limit.
    ({ context, input } = await readCibaRequest(request));
    addApiLogContext(request, {
      clientId: input.client_id,
      serverId: input.server_id,
      scope: input.scope,
      phone: input.login_hint,
      carrier: input.carrier_hint,
      operation: input.operation,
    });
    // Limit before resolving the client/server, as required by this endpoint.
    const limit = await checkTs43Limit(context, input);
    headers = limit.headers;
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, headers);
    }
  } catch (error) {
    addApiLogContext(request, { result: "invalid_request" });
    return requestFailure(error);
  }
  try {
    // Create the provider request; include rate-limit headers in this endpoint's response.
    const outcome = await cibaService.createSimCredentialRequest(
      context,
      input,
    );
    addApiLogContext(request, {
      result: outcome.kind,
      authServerId: outcome.server.id,
      ...(outcome.kind === "failure"
        ? { providerStatus: outcome.failure.status }
        : { authRequestId: outcome.authReqId }),
    });
    return startResponse(outcome, headers);
  } catch (error) {
    addApiLogContext(request, { result: "service_unavailable" });
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
    // Validate the returned credential request fields and limit token submissions.
    ({ context, input } = await readCibaRequest(request));
    addApiLogContext(request, {
      clientId: input.client_id,
      serverId: input.server_id,
      authRequestId: input.auth_req_id,
      operation: input.operation,
    });
    const limit = await checkAuthLimit("sim-token", context, input);
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    }
  } catch (error) {
    addApiLogContext(request, { result: "invalid_request" });
    return requestFailure(error);
  }
  try {
    // Exchange the browser credential; tokenResponse returns claims and sets the demo session.
    const outcome = await cibaService.exchangeSimCredential(
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
