import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger, sanitizeLogValue } from "@/shared/server/common/logger";

export const requestMiddleware: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const requestPath = (req.originalUrl || "/").split("?")[0];
  const requestTimestamp = new Date().toISOString();
  const startedAt = Date.now();

  // Static files are served alongside application routes, but do not need
  // individual access-log entries. Keep request IDs and security headers for them.
  const isStaticAsset =
    requestPath.startsWith("/vendor/") ||
    /\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|map|otf|png|svg|ttf|wasm|webp|woff2?)(?:$)/i.test(
      requestPath,
    );

  res.setHeader("X-Request-Id", requestId);
  res.locals.requestId = requestId;
  if (!isStaticAsset) {
    res.once("finish", () =>
      logger.info(
        {
          requestTimestamp,
          requestId,
          method: req.method,
          path: requestPath,
          endpoint: res.locals.apiEndpoint,
          status: res.statusCode,
          duration: Date.now() - startedAt,
          context: sanitizeLogValue(res.locals.apiLogContext || {}),
        },
        "Request completed",
      ),
    );
    // Debug logs include bounded, sanitized JSON/form bodies for POST APIs.
    res.once("finish", () =>
      logger.debug(
        {
          requestTimestamp,
          requestId,
          method: req.method,
          path: requestPath,
          requestParams: sanitizeLogValue({
            route: req.params,
            query: req.query,
            ...(res.locals.apiRequestBody === undefined
              ? {}
              : { body: res.locals.apiRequestBody }),
          }),
        },
        "Request parameters",
      ),
    );
  }
  if (!(Number(process.env.TRUST_PROXY_HOPS || 0) > 0))
    for (const name of Object.keys(req.headers))
      if (name.startsWith("x-forwarded-") || name === "forwarded")
        delete req.headers[name];
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
};
