import { legacyRedirect } from "@/shared/server/http/response";
/**
 * Returns a user without an authenticated display session to the login page.
 *
 * @returns HTTP 302 redirect to `/`.
 */
export function GET() {
  // Return users without a display session to the login page.
  return legacyRedirect("/");
}
