/** @module Mobile code exchange */

import { resolveContext } from "@/shared/server/http/context";
import { readBody } from "@/shared/server/http/body";
import { json, requestFailure } from "@/shared/server/http/response";
import {
  ApplicationError,
  providerFailure,
} from "@/shared/server/common/errors";
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
    context = resolveContext(request);
    input = decodeMobile(await readBody(request));
    const limit = await checkAuthLimit("mobile", context, input);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
  } catch (error) {
    return requestFailure(error);
  }
  try {
    // Return the exchanged user info directly; this mobile API does not set a browser session.
    const { server, userInfo } = await exchangeMobileAuthorizationCode(
      context,
      input,
    );
    return json({ auth_server: server, ...userInfo });
  } catch (error) {
    if (error instanceof ApplicationError)
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
    return json({ error: providerFailure(error).message }, 401);
  }
}
