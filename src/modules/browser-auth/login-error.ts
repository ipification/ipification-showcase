import { consumeSessionError } from "@/shared/server/session/store";
import { sessionId } from "@/shared/server/session/cookies";
import { json, unavailable } from "@/shared/server/http/response";
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
