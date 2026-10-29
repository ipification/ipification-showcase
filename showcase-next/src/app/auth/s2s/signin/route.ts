import { readBody } from "@/server/http/body";
import { authService } from "@/server/auth/service";
import { json, requestFailure } from "@/server/http/response";
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const user = await authService.userInfo(body.state);
    return user ? json(user) : new Response(null, { status: 401 });
  } catch (error) {
    return requestFailure(error);
  }
}
