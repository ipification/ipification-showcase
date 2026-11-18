import { Readable } from "node:stream";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
export function toWebRequest(req: ExpressRequest): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  headers.set("x-showcase-peer-ip", req.socket.remoteAddress || "127.0.0.1");
  const scheme = (req.socket as { encrypted?: boolean }).encrypted
    ? "https"
    : "http";
  const url = new URL(
    `${scheme}://${headers.get("host") || "localhost"}${req.originalUrl}`,
  );
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    ...(hasBody
      ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
}
export async function writeWebResponse(
  response: Response,
  res: ExpressResponse,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.end(
    response.body ? Buffer.from(await response.arrayBuffer()) : undefined,
  );
}
