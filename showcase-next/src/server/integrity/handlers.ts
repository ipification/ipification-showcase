import { randomUUID } from "node:crypto";
import { resolveContext } from "@/server/http/context";
import { readBody } from "@/server/http/body";
import { json } from "@/server/http/response";
import { logRequest } from "@/server/shared/logger";
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
export async function handleIntegrity(
  request: Request,
  endpoint: IntegrityEndpoint,
) {
  if (process.env.PLAY_INTEGRITY_ENABLED !== "true")
    return new Response(null, { status: 404 });
  const requestId = randomUUID(),
    start = Date.now();
  const respond = (status: number, body: Record<string, unknown>) => {
    logRequest({
      requestId,
      endpoint,
      status,
      decision:
        typeof body.decision === "string"
          ? body.decision
          : status < 300
            ? "allow"
            : "deny",
      reasonCodes: Array.isArray(body.reason_codes) ? body.reason_codes : [],
      duration: Date.now() - start,
    });
    return json(body, status);
  };
  const deny = (status: number, reason: string, decision = "deny") =>
    respond(status, {
      request_id: requestId,
      decision,
      reason_codes: [reason],
    });
  let body;
  try {
    body = await readBody(request, 16384);
  } catch {
    return deny(400, "INVALID_REQUEST");
  }
  try {
    const context = resolveContext(request),
      service = runtimeIntegrityService();
    const outcome = await service.execute(endpoint, context, body);
    switch (outcome.kind) {
      case "denied":
        return respond(denialStatus[outcome.category], {
          request_id: requestId,
          decision: outcome.decision,
          reason_codes: outcome.reasonCodes,
        });
      case "created":
        return respond(201, {
          attempt_id: outcome.attemptId,
          request_hash: outcome.requestHash,
          expires_at: outcome.expiresAt,
        });
      case "verified":
        return respond(201, {
          state: outcome.state,
          expires_at: outcome.expiresAt,
        });
      case "exchanged":
        return respond(200, { decision: "allow", user_info: outcome.userInfo });
    }
  } catch {
    return deny(503, "SERVICE_UNAVAILABLE", "unavailable");
  }
}
