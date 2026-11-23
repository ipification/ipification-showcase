/** @module Showcase configuration */

import { resolveContext } from "@/shared/server/http/context";
import { toPublicShowcaseConfig } from "@/config/public";
import { json, unavailable } from "@/shared/server/http/response";
/**
 * `GET /api/config` returns configuration that clients can read from the Showcase.
 *
 * @param request - The incoming request. The Showcase origin is used in
 *   callback URLs.
 * @returns HTTP 200 with {@link "Public contracts"!PublicShowcaseConfig}, or 503 when application
 *   configuration is unavailable.
 */
function getPublicConfig(request: Request) {
  try {
    // Return only the public projection; server secrets never leave this endpoint.
    const context = resolveContext(request);
    return json(toPublicShowcaseConfig(context.config, context.origin));
  } catch {
    return unavailable();
  }
}
export { getPublicConfig as GET };
