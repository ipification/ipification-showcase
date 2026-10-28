import { NextResponse, type NextRequest } from "next/server";
import { sessionId } from "@/server/session/cookies";
import { readSession } from "@/server/session/store";
export async function proxy(request: NextRequest) {
  try {
    const session = await readSession(sessionId(request));
    if (!session?.isAuthenticated || !session.userData)
      return NextResponse.rewrite(
        new URL("/auth/session-required", request.url),
      );
    return NextResponse.next();
  } catch {
    return Response.json(
      { error: "SERVICE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
export const config = { matcher: "/user/info" };
