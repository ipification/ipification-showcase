import { resolveContext } from "@/server/http/context";
import { toPublicConfig } from "@/server/config/public";
import { json, unavailable } from "@/server/http/response";
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
