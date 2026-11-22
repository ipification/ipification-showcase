import { sessionId } from "@/shared/server/session/cookies";
import { requestFailure } from "@/shared/server/http/response";
import { json } from "@/shared/server/http/response";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
import { cibaService } from "@/shared/server/ciba/service";
import {
  readCibaRequest,
  startResponse,
  tokenResponse,
  operationFailure,
} from "@/shared/server/ciba/handlers";

export async function sendSmsCode(request: Request) {
  let context, input;
  try {
    ({ context, input } = await readCibaRequest(request));
    const limit = await checkAuthLimit("sms-auth", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
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
    const limit = await checkAuthLimit("sms-token", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
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
