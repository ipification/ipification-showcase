import { resolveContext } from "@/shared/server/http/context";
import { toPublicShowcaseConfig } from "@/config/public";
import { json, unavailable } from "@/shared/server/http/response";
function getPublicConfig(request: Request) {
  try {
    const context = resolveContext(request);
    return json(toPublicShowcaseConfig(context.config, context.origin));
  } catch {
    return unavailable();
  }
}
export { getPublicConfig as GET };
