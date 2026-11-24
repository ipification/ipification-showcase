import { addApiLogContext } from "@/shared/server/common/logger";

/**
 * Reports that the HTTP process is alive.
 *
 * @returns No-store JSON with `{ status: "live" }`.
 */
export function GET(request: Request) {
  // Liveness only reports that the process can answer HTTP requests.
  addApiLogContext(request, { result: "live" });
  return Response.json(
    { status: "live" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
