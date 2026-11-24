/** @module Server-to-server results */

import { readBody } from "@/shared/server/http/body";
import { authResultStore } from "@/shared/server/storage/auth-results";
import { json, requestFailure } from "@/shared/server/http/response";
import { validState } from "@/shared/server/storage/auth-state";
import { resolveContext } from "@/shared/server/http/context";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
import { addApiLogContext } from "@/shared/server/common/logger";
/**
 * `POST /auth/s2s/signin` reads userinfo stored by a successful browser callback.
 *
 * @remarks
 * Send the browser attempt's `state`. A successful read consumes this result for
 * S2S, within a ten-minute window. Keep `state` confidential and protect access
 * to this demo endpoint with your service authentication policy.
 *
 * @param request - The incoming Showcase HTTP request.
 * @returns HTTP 200 with the raw provider claims, an empty 401 when the result
 *   is missing, used or expired, or 429 with `Retry-After` when rate limited.
 *   Check the status before parsing JSON.
 *
 * @example
 * ```http
 * POST /auth/s2s/signin
 * Content-Type: application/json
 *
 * { "state": "<browser-attempt-state>" }
 * ```
 *
 * Example response for HTTP 200. Claims vary with the provider and scope.
 *
 * ```json
 * {"sub": "<subject>", "phone_number_verified": true}
 * ```
 */
async function readS2sResult(request: Request) {
  try {
    const body = await readBody(request);
    addApiLogContext(request, { state: body.state });
    // Limit before reading a one-time result so a throttled call does not consume it.
    const limit = await checkAuthLimit("s2s", resolveContext(request), body);
    if (!limit.allowed) {
      addApiLogContext(request, { result: "rate_limited" });
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    }
    // Consume claims saved by the browser callback; this endpoint never exchanges a code.
    const user = validState(body.state)
      ? await authResultStore.consumeUserInfo(body.state)
      : undefined;
    addApiLogContext(request, {
      result: user ? "result_consumed" : "result_not_found",
    });
    return user ? json(user) : new Response(null, { status: 401 });
  } catch (error) {
    addApiLogContext(request, { result: "request_failed" });
    return requestFailure(error);
  }
}

export { readS2sResult as POST };
