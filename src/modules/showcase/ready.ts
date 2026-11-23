import { getConfig } from "@/config/load";
/**
 * Checks whether required application configuration can be loaded.
 *
 * @returns No-store JSON with `ready`, or HTTP 503 with `unavailable`.
 */
export async function GET() {
  try {
    // Read config to confirm the app can serve requests, then return readiness.
    getConfig();
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
