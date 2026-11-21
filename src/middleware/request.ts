import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestMiddleware: RequestHandler = (req, res, next) => {
  const requestId = randomUUID(),
    started = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () =>
    console.info(
      JSON.stringify({
        requestId,
        method: req.method,
        path: (req.originalUrl || "/").split("?")[0],
        status: res.statusCode,
        duration: Date.now() - started,
      }),
    ),
  );
  if (!(Number(process.env.TRUST_PROXY_HOPS || 0) > 0))
    for (const name of Object.keys(req.headers))
      if (name.startsWith("x-forwarded-") || name === "forwarded")
        delete req.headers[name];
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
};
