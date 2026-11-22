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
