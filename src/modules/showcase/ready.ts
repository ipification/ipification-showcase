import { getConfig } from "@/config/load";
import { addApiLogContext } from "@/shared/server/common/logger";
/**
 * Checks whether required application configuration can be loaded.
 *
 * @returns No-store JSON with `ready`, or HTTP 503 with `unavailable`.
 */
export async function GET(request: Request) {
  try {
    // Read config to confirm the app can serve requests, then return readiness.
    getConfig();
    addApiLogContext(request, { result: "ready" });
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    addApiLogContext(request, { result: "configuration_unavailable" });
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
