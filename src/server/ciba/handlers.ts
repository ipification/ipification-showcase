import { resolveContext } from "@/server/http/context";
import { readBody } from "@/server/http/body";
import {
  json,
  text,
  unavailable,
  requestFailure,
} from "@/server/http/response";
import { sessionId, setSessionCookie } from "@/server/session/cookies";
import { checkTs43Limit } from "@/server/store/rate-limit";
import { ApplicationError } from "@/server/shared/errors";
import {
  cibaService,
  failureData,
  type StartOutcome,
  type TokenOutcome,
} from "./service";
import { decodeCiba } from "./input";

export async function sendSmsCode(request: Request) {
  let context, input;
  try {
    ({ context, input } = await readCibaRequest(request));
  } catch (error) {
    return requestFailure(error);
  }
  try {
    const outcome = await cibaService.sendSmsCode(context, input);
    return startResponse(outcome);
  } catch (error) {
    return operationFailure(error, "auth");
  }
}

export async function verifySmsCode(request: Request) {
  let context, input;
  try {
    ({ context, input } = await readCibaRequest(request));
  } catch (error) {
    return requestFailure(error);
  }
  try {
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

export async function exchangeSimCredential(request: Request) {
  let context, input;
  try {
    ({ context, input } = await readCibaRequest(request));
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

async function readCibaRequest(request: Request) {
  const context = resolveContext(request);
  const input = decodeCiba(await readBody(request));
  return { context, input };
}

function startResponse(
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

function tokenResponse(outcome: TokenOutcome, origin: string) {
  return setSessionCookie(
    outcome.kind === "failure"
      ? json(failureData(outcome.failure), outcome.failure.status)
      : json({ auth_server: outcome.server, ...outcome.data }),
    outcome.sessionId,
    origin,
  );
}

function operationFailure(error: unknown, operation: "auth" | "token") {
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
