import { getConfig } from "@/server/config/load";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
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
