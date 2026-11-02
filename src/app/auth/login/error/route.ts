import { consumeSessionError } from "@/server/session/store";
import { sessionId } from "@/server/session/cookies";
import { json, unavailable } from "@/server/http/response";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    // Read once and clear the session message so a refresh does not repeat it.
    return json({
      error_message: await consumeSessionError(sessionId(request)),
    });
  } catch {
    return unavailable();
  }
}
