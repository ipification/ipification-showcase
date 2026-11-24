import { consumeSessionError } from "@/shared/server/session/store";
import { sessionId } from "@/shared/server/session/cookies";
import { json, unavailable } from "@/shared/server/http/response";
import { addApiLogContext } from "@/shared/server/common/logger";
/**
 * Reads and consumes the current session's one-time login error.
 *
 * @param request - Request carrying the Showcase session cookie.
 * @returns JSON with `error_message`, or HTTP 503 if session storage is unavailable.
 */
export async function GET(request: Request) {
  try {
    // Consume once so the same login error is not shown again after a refresh.
    const errorMessage = await consumeSessionError(sessionId(request));
    addApiLogContext(request, {
      result: errorMessage ? "login_error_consumed" : "no_login_error",
    });
    return json({ error_message: errorMessage });
  } catch {
    addApiLogContext(request, { result: "session_unavailable" });
    return unavailable();
  }
}
