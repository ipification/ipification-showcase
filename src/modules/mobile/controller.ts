import { resolveContext } from "@/shared/server/http/context";
import { readBody } from "@/shared/server/http/body";
import { json, requestFailure } from "@/shared/server/http/response";
import { ApplicationError, providerFailure } from "@/shared/server/common/errors";
import { authService } from "@/modules/browser-auth/service";
import { decodeMobile } from "@/modules/browser-auth/input";
export async function exchangeMobileCode(request: Request) {
  let context, input;
  try {
    context = resolveContext(request);
    input = decodeMobile(await readBody(request));
  } catch (error) {
    return requestFailure(error);
  }
  try {
    // Return the exchanged user info directly; this mobile API does not set a browser session.
    const { server, userInfo } = await authService.exchangeMobileCode(
      context,
      input,
    );
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
