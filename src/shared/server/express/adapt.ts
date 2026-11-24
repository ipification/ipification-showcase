import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { logger, takeApiLogContext } from "@/shared/server/common/logger";
import { readBody } from "@/shared/server/http/body";
import { toWebRequest, writeWebResponse } from "./http";
export type Handler = (request: Request) => Response | Promise<Response>;
export function adapt(handler: Handler) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    const request = toWebRequest(req);
    const requestId = res.locals.requestId;
    if (requestId) request.headers.set("x-request-id", String(requestId));
    res.locals.apiEndpoint = `${req.method} ${String(req.route?.path || req.path)}`;
    // Capture only bounded JSON/form bodies for debug logs. Play Integrity
    // payloads contain sensitive attestation material and are never captured.
    const contentType = request.headers
      .get("content-type")
      ?.split(";")[0]
      .trim();
    const captureRequestBody =
      req.method === "POST" &&
      logger.isLevelEnabled("debug") &&
      !res.locals.apiEndpoint.includes("/api/play-integrity/") &&
      (contentType === "application/json" ||
        contentType === "application/x-www-form-urlencoded");
    const requestBodyForLog = captureRequestBody
      ? readBody(request.clone(), 102400).catch(() => undefined)
      : Promise.resolve(undefined);
    try {
      const response = await handler(request);
      res.locals.apiRequestBody = await requestBodyForLog;
      res.locals.apiLogContext = takeApiLogContext(request);
      await writeWebResponse(response, res);
    } catch {
      res.locals.apiRequestBody = await requestBodyForLog;
      res.locals.apiLogContext = { result: "handler_error" };
      Object.assign(res.locals.apiLogContext, takeApiLogContext(request));
      if (!res.headersSent) res.status(500).end();
    }
  };
}
