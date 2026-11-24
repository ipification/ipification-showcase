/** @module Showcase configuration */

import { resolveContext } from "@/shared/server/http/context";
import { toPublicShowcaseConfig } from "@/config/public";
import { json, unavailable } from "@/shared/server/http/response";
import { addApiLogContext } from "@/shared/server/common/logger";
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
    const responseConfig = toPublicShowcaseConfig(
      context.config,
      context.origin,
    );
    addApiLogContext(request, {
      result: "public_config_returned",
      authServerCount: context.config.auth_servers.length,
      clientFlowCount: context.config.clients.length,
      origin: context.origin,
    });
    return json(responseConfig);
  } catch {
    addApiLogContext(request, { result: "configuration_unavailable" });
    return unavailable();
  }
}
export { getPublicConfig as GET };
