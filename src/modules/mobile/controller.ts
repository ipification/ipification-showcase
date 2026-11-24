/** @module Mobile code exchange */

import { resolveContext } from "@/shared/server/http/context";
import { readBody } from "@/shared/server/http/body";
import { json, requestFailure } from "@/shared/server/http/response";
import {
  ApplicationError,
  providerFailure,
} from "@/shared/server/common/errors";
import { addApiLogContext } from "@/shared/server/common/logger";
import { decodeMobile, exchangeMobileAuthorizationCode } from "./service";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
/**
 * `POST /auth/mobile/login` exchanges a mobile authorization code and returns provider claims.
 *
 * @remarks
 * Send JSON with `client_id`, `code` and the original `redirect_uri`. An omitted
 * `server_id` selects the first configured server. The handler does not create a
 * browser session or store a result for S2S. Treat the returned claims as
 * provider-specific and keep the authorization code confidential.
 *
 * @param request - The incoming Showcase HTTP request.
 * @returns HTTP 200 with `auth_server` and provider claims. An unknown server
 *   returns 400. An unknown client or a failed exchange returns 401. Rate
 *   limiting returns 429 with `Retry-After`.
 *
 * @example
 * ```http
 * POST /auth/mobile/login
 * Content-Type: application/json
 *
 * {
 *   "client_id": "<configured-client-id>",
 *   "server_id": "stage",
 *   "code": "<authorization-code>",
 *   "redirect_uri": "<registered-redirect-uri>"
 * }
 * ```
 *
 * Example response for HTTP 200. Claims vary with the provider and scope.
 *
 * ```json
 * {"auth_server": {"id": "stage", "url": "https://auth.example"}, "sub": "<subject>"}
 * ```
 */
export async function exchangeMobileCode(request: Request) {
  let context, input;
  try {
    // Resolve the request context and keep only fields used by the mobile exchange.
    context = resolveContext(request);
    input = decodeMobile(await readBody(request));
    addApiLogContext(request, {
      clientId: input.client_id,
      serverId: input.server_id,
      code: input.code,
      redirectUriProvided: Boolean(input.redirect_uri),
    });
    // Apply the endpoint's rate limit before making a provider request.
    const limit = await checkAuthLimit("mobile", context, input);
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    }
  } catch (error) {
    addApiLogContext(request, { result: "invalid_request" });
    return requestFailure(error);
  }
  try {
    // Exchange the authorization code and return claims directly; mobile login has no browser session.
    const { server, userInfo } = await exchangeMobileAuthorizationCode(
      context,
      input,
    );
    addApiLogContext(request, {
      result: "claims_returned",
      authServerId: server.id,
      claimCount: Object.keys(userInfo).length,
    });
    return json({ auth_server: server, ...userInfo });
  } catch (error) {
    if (error instanceof ApplicationError) {
      addApiLogContext(request, { result: "rejected", reason: error.code });
      return error.code === "CLIENT_NOT_FOUND"
        ? json({ error: "Client not found" }, 401)
        : json(
            {
              error: error.input
                ? `Invalid server_id: '${error.input}'`
                : "No auth servers configured",
            },
            400,
          );
    }
    addApiLogContext(request, {
      result: "provider_failure",
      providerStatus: providerFailure(error).status,
    });
    return json({ error: providerFailure(error).message }, 401);
  }
}
