import { legacyRedirect } from "@/shared/server/http/response";
import { addApiLogContext } from "@/shared/server/common/logger";
/**
 * Returns a user without an authenticated display session to the login page.
 *
 * @returns HTTP 302 redirect to `/`.
 */
export function GET(request: Request) {
  // Return users without a display session to the login page.
  addApiLogContext(request, { result: "redirected_to_login" });
  return legacyRedirect("/");
}
