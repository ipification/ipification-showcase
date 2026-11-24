import { BodyParseError } from "./body";
export const privateHeaders = { "Cache-Control": "private, no-store" };
export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { ...privateHeaders, ...headers },
  });
}
export function text(body: string, status = 200) {
  return new Response(
    body
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
    {
      status,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
export function legacyRedirect(location: string) {
  return new Response(null, {
    status: 302,
    headers: { ...privateHeaders, Location: location },
  });
}
export function unavailable() {
  return json({ error: "SERVICE_UNAVAILABLE" }, 503);
}

// The legacy app's global error middleware maps parser failures to HTTP 500.
export function requestFailure(error: unknown) {
  return error instanceof BodyParseError
    ? json({ error: "INVALID_REQUEST" }, 500)
    : unavailable();
}
