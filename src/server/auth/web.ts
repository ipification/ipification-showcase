import { resolveContext } from "@/server/http/context";
import { query, readBody } from "@/server/http/body";
import {
  json,
  text,
  legacyRedirect,
  unavailable,
} from "@/server/http/response";
import { sessionId, setSessionCookie } from "@/server/session/cookies";
import { ApplicationError, AuthAttemptError } from "@/server/shared/errors";
import { authService } from "./service";
import { decodeStart, decodeCallback, decodePrepare } from "./input";
import { callbackFailure } from "./failure";
import { AUTH_ATTEMPT_MS, QR_SCAN_MS } from "./attempts";
import { authBinding, newBinding, setAuthBinding } from "./state-cookies";

export async function prepareWebAuthentication(request: Request) {
  try {
    const context = resolveContext(request);
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== context.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return json({ error: "INVALID_REQUEST" }, 400);
    // The initiating browser keeps this owner cookie; the phone scanning a QR gets
    // a separate callback cookie when it opens /auth/start.
    const owner = newBinding();
    const prepared = await authService.prepareWebAuthentication(
      context,
      decodePrepare(await readBody(request, 16384)),
      owner,
    );
    return setAuthBinding(
      json(prepared, 201),
      "owner",
      prepared.state,
      owner,
      context.origin,
      false,
      prepared.state.endsWith("-qrcode")
        ? QR_SCAN_MS + AUTH_ATTEMPT_MS
        : AUTH_ATTEMPT_MS,
    );
  } catch (error) {
    if (error instanceof AuthAttemptError)
      return json({ error: error.reason }, 400);
    if (error instanceof ApplicationError)
      return json({ error: error.code }, 400);
    return unavailable();
  }
}

export async function startWebAuthentication(request: Request) {
  try {
    const context = resolveContext(request),
      input = decodeStart(query(request));
    const callback = newBinding();
    const outcome = await authService.startWebAuthentication(context, input, {
      owner: authBinding(request, "owner", input.state),
      callback,
    });
    return setAuthBinding(
      legacyRedirect(outcome.url),
      "callback",
      outcome.state,
      callback,
      context.origin,
    );
  } catch (error) {
    if (error instanceof AuthAttemptError)
      return callbackFailure(request, error);
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

export async function handleAuthorizationCallback(
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
    callbackBinding: "",
  };
  input.callbackBinding = authBinding(request, "callback", input.state);
  const finish = (response: Response) =>
    input.backchannel
      ? response
      : setAuthBinding(
          response,
          "callback",
          String(input.state),
          "",
          context.origin,
          true,
        );
  try {
    const outcome = await authService.handleAuthorizationCallback(
      context,
      input,
    );
    switch (outcome.kind) {
      case "pending":
        return legacyRedirect(`/auth/pending?state=${outcome.state}`);
      case "provider_error":
        return finish(
          setSessionCookie(
            legacyRedirect(outcome.qr ? "/auth/qrcode/error" : "/auth/login"),
            outcome.sessionId,
            context.origin,
          ),
        );
      case "backchannel":
        return new Response(null, {
          status: 200,
          headers: { "Cache-Control": "private, no-store" },
        });
      case "qr":
        return finish(
          legacyRedirect(
            outcome.failed ? "/auth/qrcode/error" : "/auth/qrcode/complete",
          ),
        );
      case "redirect":
        return finish(legacyRedirect(outcome.url));
    }
  } catch (error) {
    if (error instanceof AuthAttemptError)
      return finish(callbackFailure(request, error));
    if (error instanceof ApplicationError)
      return finish(
        error.code === "CLIENT_NOT_FOUND"
          ? text("Client not found")
          : text(`Invalid server_id: '${serverId}'`, 400),
      );
    return finish(
      input.error || input.error_description
        ? unavailable()
        : callbackFailure(request, error),
    );
  }
}

export async function completeWebAuthentication(request: Request) {
  try {
    const context = resolveContext(request),
      state = query(request).state;
    const outcome = await authService.completeWebAuthentication(
      context,
      state,
      sessionId(request),
      authBinding(request, "owner", state),
    );
    // Completion is claimed by the owner, then the result becomes a display session.
    const response = setSessionCookie(
      legacyRedirect(
        typeof outcome === "string" ? "/user/info" : "/auth/login",
      ),
      typeof outcome === "string" ? outcome : outcome.sessionId,
      context.origin,
    );
    return setAuthBinding(
      response,
      "owner",
      String(state),
      "",
      context.origin,
      true,
    );
  } catch (error) {
    return error instanceof AuthAttemptError
      ? callbackFailure(request, error)
      : unavailable();
  }
}

export async function getAuthenticationStatus(request: Request) {
  try {
    const context = resolveContext(request),
      state = query(request).state;
    return json(
      await authService.getAuthenticationStatus(
        context,
        state,
        authBinding(request, "owner", state),
        sessionId(request),
      ),
    );
  } catch (error) {
    return error instanceof AuthAttemptError
      ? json({ error: error.reason }, 400)
      : unavailable();
  }
}
