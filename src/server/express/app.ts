import express from "express";
import path from "node:path";
import { getConfig } from "@/server/config/load";
import { toPublicShowcaseConfig } from "@/server/config/public";
import { resolveContext } from "@/server/http/context";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { toWebRequest, writeWebResponse } from "./http";
import { userInfo, qrError, authError } from "./pages";
import { GET as root } from "@/app/route";
import { GET as live } from "@/app/health/live/route";
import { GET as ready } from "@/app/health/ready/route";
import { GET as config } from "@/app/api/config/route";
import { GET as geoip } from "@/app/api/geoip/route";
import { GET as start } from "@/app/auth/start/route";
import { GET as status } from "@/app/auth/status/route";
import { GET as complete } from "@/app/auth/complete/route";
import { GET as callback } from "@/app/auth/callback/[userFlow]/[serverId]/route";
import { GET as loginError } from "@/app/auth/login/error/route";
import { GET as sessionRequired } from "@/app/auth/session-required/route";
import { POST as prepare } from "@/app/auth/prepare/route";
import { POST as mobile } from "@/app/auth/mobile/login/route";
import { POST as s2s } from "@/app/auth/s2s/signin/route";
import { POST as smsAuth } from "@/app/sms/auth/route";
import { POST as smsToken } from "@/app/sms/token/route";
import { POST as smsLog } from "@/app/sms/log/route";
import { POST as simAuth } from "@/app/ts43/auth/route";
import { POST as simToken } from "@/app/ts43/token/route";
import { POST as simLog } from "@/app/ts43/log/route";
import { POST as integrityAttempt } from "@/app/api/play-integrity/attempt/route";
import { POST as integrityVerify } from "@/app/api/play-integrity/verify/route";
import { POST as integrityToken } from "@/app/api/play-integrity/token-exchange/route";
type Handler = (request: Request) => Response | Promise<Response>;
function adapt(handler: Handler) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      await writeWebResponse(await handler(toWebRequest(req)), res);
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  };
}
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!(Number(process.env.TRUST_PROXY_HOPS || 0) > 0))
      for (const name of Object.keys(req.headers))
        if (name.startsWith("x-forwarded-") || name === "forwarded")
          delete req.headers[name];
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });
  const get: [string, Handler][] = [
    ["/", root],
    ["/health/live", live],
    ["/health/ready", ready],
    ["/api/config", config],
    ["/api/geoip", geoip],
    ["/auth/start", start],
    ["/auth/status", status],
    ["/auth/complete", complete],
    ["/auth/login/error", loginError],
    ["/auth/session-required", sessionRequired],
  ];
  const post: [string, Handler][] = [
    ["/auth/prepare", prepare],
    ["/auth/mobile/login", mobile],
    ["/auth/s2s/signin", s2s],
    ["/sms/auth", smsAuth],
    ["/sms/token", smsToken],
    ["/sms/log", smsLog],
    ["/ts43/auth", simAuth],
    ["/ts43/token", simToken],
    ["/ts43/log", simLog],
    ["/api/play-integrity/attempt", integrityAttempt],
    ["/api/play-integrity/verify", integrityVerify],
    ["/api/play-integrity/token-exchange", integrityToken],
  ];
  for (const [path, handler] of get) app.get(path, adapt(handler));
  for (const [path, handler] of post) app.post(path, adapt(handler));
  app.get("/auth/callback/:userFlow/:serverId", (req, res) =>
    adapt((request) =>
      callback(request, {
        params: Promise.resolve({
          userFlow: String(req.params.userFlow),
          serverId: String(req.params.serverId),
        }),
      }),
    )(req, res),
  );
  app.get("/api/showcase-config", (req, res) => {
    try {
      const request = toWebRequest(req);
      res
        .set("Cache-Control", "private, no-store")
        .json(
          toPublicShowcaseConfig(getConfig(), resolveContext(request).origin),
        );
    } catch {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
    }
  });
  app.get("/auth/pending", (_req, res) =>
    res.sendFile(path.resolve("public/pending.html")),
  );
  app.get("/auth/login", (_req, res) =>
    res.sendFile(path.resolve("public/login.html")),
  );
  app.use(
    "/vendor/qrcode",
    express.static(path.resolve("node_modules/qrcode-generator/dist")),
  );
  app.use(
    "/vendor/intl",
    express.static(path.resolve("node_modules/intl-tel-input/dist")),
  );
  app.use(express.static(path.resolve("public")));
  app.get("/auth/qrcode/complete", (_req, res) =>
    res
      .type("html")
      .send(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/showcase.css"></head><body><main class="legacy-status-page"><div class="legacy-status-message"><h1>Success</h1><p>You've been authenticated</p><span class="legacy-status-success" aria-hidden="true"></span></div></main></body></html>`,
      ),
  );
  app.get("/auth/error", authError);
  app.get("/user/info", userInfo);
  app.get("/auth/qrcode/error", qrError);
  return app;
}
