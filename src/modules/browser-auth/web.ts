/** @module Browser authorization */

import { resolveContext } from "@/shared/server/http/context";
import { query, readBody } from "@/shared/server/http/body";
import {
  json,
  text,
  legacyRedirect,
  unavailable,
} from "@/shared/server/http/response";
import { sessionId, setSessionCookie } from "@/shared/server/session/cookies";
import { ApplicationError, AuthAttemptError } from "@/shared/server/common/errors";
import { authService } from "./service";
import { decodeStart, decodeCallback, decodePrepare } from "./input";
import { callbackFailure } from "./failure";
import { AUTH_ATTEMPT_MS, QR_SCAN_MS } from "./attempts";
import { authBinding, newBinding, setAuthBinding } from "./state-cookies";

/**
 * `POST /auth/prepare` creates a state for browser authorization.
 *
 * @param request - Send JSON with `user_flow`, `server_id`, a boolean `qr`
 *   and `phone` for flows that expect an entered number.
 * @returns HTTP 201 with `state`, `url` and `expiresAt`, plus an owner cookie.
 *   Keep the cookie and use the returned URL for navigation or the QR code.
 */
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
    // Issue the owner binding before creating the attempt; the same cookie is needed
    // when this browser later checks status and claims the result.
    // The initiating browser keeps this owner cookie; the phone scanning a QR gets
    // a separate callback cookie when it opens /auth/start.
    const owner = newBinding();
    // Decode only the supported request fields and keep the HTTP body size bounded.
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

/**
 * `GET /auth/start` starts a prepared browser authorization attempt.
 *
 * @param request - Navigate to the exact URL returned by
 *   {@link prepareWebAuthentication}. For QR, the phone opens that URL.
 * @returns A redirect to the provider on success.
 */
export async function startWebAuthentication(request: Request) {
  try {
    const context = resolveContext(request);
    const input = decodeStart(query(request));

    // The owner started the flow. For QR, the phone opening the link is a different browser.
    const ownerCookie = authBinding(request, "owner", input.state);
    const callbackToken = newBinding();
    const authorization = await authService.startPreparedAttempt(context, input, {
      owner: ownerCookie,
      callback: callbackToken,
    });

    // Bind the browser that follows this redirect to the later provider callback.
    const redirect = legacyRedirect(authorization.url);
    return setAuthBinding(
      redirect,
      "callback",
      authorization.state,
      callbackToken,
      context.origin,
    );
  } catch (error) {
    if (error instanceof AuthAttemptError)
      return callbackFailure(request, error);
    if (error instanceof ApplicationError) {
      if (error.code === "CLIENT_NOT_FOUND") return text("Client not found");
      const reason = error.input
        ? "INVALID_SERVER_ID"
        : "NO_AUTH_SERVERS_CONFIGURED";
      return json({ error: reason }, 400);
    }
    return unavailable();
  }
}

/**
 * `GET /auth/callback/:userFlow/:serverId` handles the authorization server's callback.
 *
 * @param request - The provider redirect with `state`, `code` or error fields.
 * @param routeParams - Flow name and authorization server ID from the callback path.
 * @returns A browser redirect, or an empty HTTP 200 for a successful IM
 *   backchannel callback.
 */
export async function handleAuthorizationCallback(
  request: Request,
  routeParams: { userFlow: string; serverId: string },
) {
  const { userFlow, serverId } = routeParams;
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
  // Clear the one-use callback cookie after handling the provider's browser redirect.
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
    // Translate the service outcome into the appropriate page or backchannel response.
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

/**
 * `GET /auth/complete?state=...` claims a finished browser attempt.
 *
 * @param request - Navigate to the completion URL using the owner browser.
 * @returns A redirect and, on success, a display session cookie for `/user/info`.
 */
export async function completeWebAuthentication(request: Request) {
  try {
    const context = resolveContext(request),
      state = query(request).state;
    // The service checks the owner binding and creates a one-use display session.
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

/**
 * `GET /auth/status?state=...` checks the state of a browser attempt.
 *
 * @param request - The attempt state and the initiating browser's cookie.
 * @returns HTTP 200 with `pending`, `completed`, `failed` or `finished` in
 *   `status`. Follow `completionUrl` when provided for a completed or failed
 *   attempt. Unavailable or invalid attempts return a non-success status.
 */
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
