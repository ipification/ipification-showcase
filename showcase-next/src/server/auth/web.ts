import { resolveContext } from "@/server/http/context";
import { query } from "@/server/http/body";
import {
  json,
  text,
  legacyRedirect,
  unavailable,
} from "@/server/http/response";
import { sessionId, setSessionCookie } from "@/server/session/cookies";
import { ApplicationError } from "@/server/shared/errors";
import { authService } from "./service";
import { decodeStart, decodeCallback } from "./input";
import { callbackFailure } from "./failure";
export async function start(request: Request) {
  try {
    const outcome = authService.begin(
      resolveContext(request),
      decodeStart(query(request)),
    );
    return legacyRedirect(
      outcome.kind === "login_required" ? "/auth/login" : outcome.url,
    );
  } catch (error) {
    if (error instanceof ApplicationError)
      return error.code === "CLIENT_NOT_FOUND"
        ? text("Client not found")
        : json(
            {
              error: error.input
                ? "INVALID_SERVER_ID"
                : "NO_AUTH_SERVERS_CONFIGURED",
            },
            400,
          );
    return unavailable();
  }
}
export async function callback(
  request: Request,
  { userFlow, serverId }: { userFlow: string; serverId: string },
) {
  let context;
  try {
    context = resolveContext(request);
  } catch {
    return unavailable();
  }
  const input = {
    ...decodeCallback(query(request)),
    userFlow,
    serverId,
    previousSessionId: sessionId(request),
    backchannel: request.headers.get("ip-backchannel-im-auth") === "true",
  };
  try {
    const outcome = await authService.callback(context, input);
    switch (outcome.kind) {
      case "provider_error":
        return setSessionCookie(
          legacyRedirect("/auth/login"),
          outcome.sessionId,
          context.origin,
        );
      case "backchannel":
        return new Response(null, {
          status: 200,
          headers: { "Cache-Control": "private, no-store" },
        });
      case "qr":
        return legacyRedirect(
          outcome.failed ? "/auth/qrcode/error" : "/auth/qrcode/complete",
        );
      case "redirect":
        return legacyRedirect(outcome.url);
    }
  } catch (error) {
    if (error instanceof ApplicationError)
      return error.code === "CLIENT_NOT_FOUND"
        ? text("Client not found")
        : text(`Invalid server_id: '${serverId}'`, 400);
    // Provider cancellation/session errors historically use the unavailable response.
    return input.error || input.error_description
      ? unavailable()
      : callbackFailure(request, error);
  }
}
export async function complete(request: Request) {
  try {
    const context = resolveContext(request),
      id = await authService.complete(query(request).state, sessionId(request));
    return id
      ? setSessionCookie(legacyRedirect("/user/info"), id, context.origin)
      : legacyRedirect("/");
  } catch {
    return unavailable();
  }
}
