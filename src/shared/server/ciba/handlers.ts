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

export async function readCibaRequest(request: Request) {
  const context = resolveContext(request);
  const input = decodeCiba(await readBody(request));
  return { context, input };
}

export function startResponse(
  outcome: StartOutcome,
  headers: Record<string, string> = {},
) {
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

export function tokenResponse(outcome: TokenOutcome, origin: string) {
  return setSessionCookie(
    outcome.kind === "failure"
      ? json(failureData(outcome.failure), outcome.failure.status)
      : json({ auth_server: outcome.server, ...outcome.data }),
    outcome.sessionId,
    origin,
  );
}

export function operationFailure(error: unknown, operation: "auth" | "token") {
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

export async function diagnostics(request: Request) {
  try {
    await readBody(request);
    return text("OK");
  } catch (error) {
    return requestFailure(error);
  }
}
