import { resolveContext } from "@/shared/server/http/context";
import { toPublicConfig } from "@/config/public";
import { json, unavailable } from "@/shared/server/http/response";
function getPublicConfig(request: Request) {
  try {
    const context = resolveContext(request);
    // Expose the existing public projection, not the private server configuration.
    return json(toPublicConfig(context.config, context.origin));
  } catch {
    return unavailable();
  }
}
export { getPublicConfig as GET };
