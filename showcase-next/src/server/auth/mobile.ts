import { resolveContext } from "@/server/http/context";
import { readBody } from "@/server/http/body";
import { json, requestFailure } from "@/server/http/response";
import { ApplicationError, providerFailure } from "@/server/shared/errors";
import { authService } from "./service";
import { decodeMobile } from "./input";
export async function mobileLogin(request: Request) {
  let context, input;
  try {
    context = resolveContext(request);
    input = decodeMobile(await readBody(request));
  } catch (error) {
    return requestFailure(error);
  }
  try {
    const { server, userInfo } = await authService.mobile(context, input);
    return json({ auth_server: server, ...userInfo });
  } catch (error) {
    if (error instanceof ApplicationError)
      return error.code === "CLIENT_NOT_FOUND"
        ? json({ error: "Client not found" }, 401)
        : json(
            {
              error: error.input
                ? `Invalid server_id: '${error.input}'`
                : "No auth servers configured",
            },
            400,
          );
    return json({ error: providerFailure(error).message }, 401);
  }
}
