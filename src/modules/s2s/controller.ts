import { readBody } from "@/shared/server/http/body";
import { authService } from "@/modules/browser-auth/service";
import { json, requestFailure } from "@/shared/server/http/response";
async function readS2sResult(request: Request) {
  try {
    const body = await readBody(request);
    // Read the result already saved by the callback; do not exchange a code again.
    const user = await authService.readS2sResult(body.state);
    return user ? json(user) : new Response(null, { status: 401 });
  } catch (error) {
    return requestFailure(error);
  }
}

export { readS2sResult as POST };
