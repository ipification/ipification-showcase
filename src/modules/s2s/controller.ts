import { readBody } from "@/shared/server/http/body";
import { authService } from "@/modules/browser-auth/service";
import { json, requestFailure } from "@/shared/server/http/response";
import { validState } from "@/modules/browser-auth/attempts";
import { resolveContext } from "@/shared/server/http/context";
import { checkAuthLimit } from "@/shared/server/storage/rate-limit";
async function readS2sResult(request: Request) {
  try {
    const body = await readBody(request);
    const limit = await checkAuthLimit("s2s", resolveContext(request), body);
    if (!limit.allowed)
      return json({ error: "RATE_LIMITED" }, 429, limit.headers);
    // Read the result already saved by the callback; do not exchange a code again.
    const user = validState(body.state)
      ? await authService.readS2sResult(body.state)
      : undefined;
    return user ? json(user) : new Response(null, { status: 401 });
  } catch (error) {
    return requestFailure(error);
  }
}

export { readS2sResult as POST };
