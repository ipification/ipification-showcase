import { resolveContext } from "@/server/http/context";
import { toPublicConfig } from "@/server/config/public";
import { json, unavailable } from "@/server/http/response";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    const c = resolveContext(request);
    return json(toPublicConfig(c.config, c.origin));
  } catch {
    return unavailable();
  }
}
