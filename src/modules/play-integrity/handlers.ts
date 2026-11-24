/** @module Play Integrity */

import { randomUUID } from "node:crypto";
import { resolveContext } from "@/shared/server/http/context";
import { readBody } from "@/shared/server/http/body";
import { json } from "@/shared/server/http/response";
import { addApiLogContext } from "@/shared/server/common/logger";
import { runtimeIntegrityService } from "./runtime";
import type { IntegrityEndpoint } from "./input";
import type { IntegrityCategory } from "./service";
const denialStatus: Record<IntegrityCategory, number> = {
  input: 400,
  conflict: 409,
  policy: 403,
  unavailable: 503,
  exchange: 401,
};
/**
 * Handles Android Play Integrity attempts, verification and code exchange.
 *
 * @remarks
 * - `POST /api/play-integrity/attempt` accepts `phone_number` and `server_id`.
 *   HTTP 201 returns `attempt_id`, `request_hash` and `expires_at`.
 * - `POST /api/play-integrity/verify` accepts `attempt_id` and `integrity_token`.
 *   HTTP 201 returns the signed `state` and `expires_at` after verification.
 * - `POST /api/play-integrity/token-exchange` accepts `code` and signed `state`.
 *   HTTP 200 returns `decision: "allow"` and `user_info`.
 *
 * @param request - The incoming JSON request. The handler limits its body to 16 KiB.
 * @param endpoint - Operation selected by the Express route.
 * @returns The operation result, or an error envelope with `request_id`,
 *   `decision` and `reason_codes`.
 */
export async function handleIntegrity(
  request: Request,
  endpoint: IntegrityEndpoint,
) {
  // Keep a response reference ID for the existing error response contract.
  const requestId = randomUUID();
  let requestContext: Record<string, unknown> = {};
  /** @param status - HTTP status to send. @param body - Response fields. @returns The API response with its searchable request context recorded. */
  const logAndRespond = (status: number, body: Record<string, unknown>) => {
    addApiLogContext(request, {
      endpoint,
      status,
      ...requestContext,
      decision:
        typeof body.decision === "string"
          ? body.decision
          : status < 300
            ? "allow"
            : "deny",
      reasonCodes: Array.isArray(body.reason_codes) ? body.reason_codes : [],
    });
    return json(body, status);
  };
  /** @param status - HTTP status to send. @param reason - Stable reason code. @param decision - Optional decision label. @returns Logged denial response. */
  const rejectWithReason = (
    status: number,
    reason: string,
    decision = "deny",
  ) =>
    logAndRespond(status, {
      request_id: requestId,
      decision,
      reason_codes: [reason],
    });
  let requestBody;
  try {
    // Reject oversized or malformed bodies before creating the runtime services.
    requestBody = await readBody(request, 16384);
    requestContext = {
      serverId: requestBody.server_id,
      phone: requestBody.phone_number,
      attemptId: requestBody.attempt_id,
      token: requestBody.integrity_token,
      code: requestBody.code,
      state: requestBody.state,
    };
  } catch {
    return rejectWithReason(400, "INVALID_REQUEST");
  }
  try {
    // Resolve request-specific config, execute the selected operation, then map its result to HTTP.
    const context = resolveContext(request),
      service = runtimeIntegrityService();
    const outcome = await service.execute(endpoint, context, requestBody);
    switch (outcome.kind) {
      case "denied":
        return logAndRespond(denialStatus[outcome.category], {
          request_id: requestId,
          decision: outcome.decision,
          reason_codes: outcome.reasonCodes,
        });
      case "created":
        return logAndRespond(201, {
          attempt_id: outcome.attemptId,
          request_hash: outcome.requestHash,
          expires_at: outcome.expiresAt,
        });
      case "verified":
        return logAndRespond(201, {
          state: outcome.state,
          expires_at: outcome.expiresAt,
        });
      case "exchanged":
        return logAndRespond(200, {
          decision: "allow",
          user_info: outcome.userInfo,
        });
    }
  } catch {
    return rejectWithReason(503, "SERVICE_UNAVAILABLE", "unavailable");
  }
}
