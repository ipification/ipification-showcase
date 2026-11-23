/**
 * Reports that the HTTP process is alive.
 *
 * @returns No-store JSON with `{ status: "live" }`.
 */
export function GET() {
  // Liveness only reports that the process can answer HTTP requests.
  return Response.json(
    { status: "live" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
