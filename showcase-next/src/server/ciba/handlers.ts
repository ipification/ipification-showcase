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
import { cibaService, failureData } from "./service";
import { decodeCiba } from "./input";
import type { Protocol } from "./provider";
async function handle(
  request: Request,
  protocol: Protocol,
  operation: "auth" | "token",
) {
  let context,
    input,
    headers: Record<string, string> = {};
  try {
    context = resolveContext(request);
    input = decodeCiba(await readBody(request));
    if (protocol === "ts43" && operation === "auth") {
      const limit = await checkTs43Limit(context, input);
      headers = limit.headers;
      if (!limit.allowed) return json({ error: "RATE_LIMITED" }, 429, headers);
    }
  } catch (error) {
    return requestFailure(error);
  }
  try {
    if (operation === "auth") {
      const outcome = await cibaService.start(context, protocol, input);
      return outcome.kind === "failure"
        ? json(
            {
              auth_server: outcome.server,
              success: false,
              ...failureData(outcome.failure),
            },
            outcome.failure.status,
            headers,
          )
        : json(
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
    const outcome = await cibaService.token(
      context,
      protocol,
      input,
      sessionId(request),
    );
    return setSessionCookie(
      outcome.kind === "failure"
        ? json(failureData(outcome.failure), outcome.failure.status)
        : json({ auth_server: outcome.server, ...outcome.data }),
      outcome.sessionId,
      context.origin,
    );
  } catch (error) {
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
      return operation === "auth"
        ? text("Client not found", 401)
        : json({ error: "Client not found" }, 401);
    }
    return unavailable();
  }
}
export const smsAuth = (r: Request) => handle(r, "sms", "auth");
export const smsToken = (r: Request) => handle(r, "sms", "token");
export const ts43Auth = (r: Request) => handle(r, "ts43", "auth");
export const ts43Token = (r: Request) => handle(r, "ts43", "token");
export async function diagnostics(request: Request) {
  try {
    await readBody(request);
    return text("OK");
  } catch (error) {
    return requestFailure(error);
  }
}
