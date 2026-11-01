const cookieName = "showcase_next_sid";
export function sessionId(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="));
  const id = cookie?.slice(cookieName.length + 1) || "";
  return /^[a-f0-9]{64}$/.test(id) ? id : "";
}
export function setSessionCookie(
  response: Response,
  id: string,
  origin: string,
) {
  response.headers.append(
    "Set-Cookie",
    `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${origin.startsWith("https:") ? "; Secure" : ""}`,
  );
  return response;
}
