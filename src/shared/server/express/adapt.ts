import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { toWebRequest, writeWebResponse } from "./http";
export type Handler = (request: Request) => Response | Promise<Response>;
export function adapt(handler: Handler) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      await writeWebResponse(await handler(toWebRequest(req)), res);
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  };
}
