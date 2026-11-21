import express from "express";
import { randomUUID } from "node:crypto";
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
import { GET as root } from "@/server/express/routes/route";
import { GET as live } from "@/server/express/routes/health/live/route";
import { GET as ready } from "@/server/express/routes/health/ready/route";
import { GET as config } from "@/server/express/routes/api/config/route";
import { GET as geoip } from "@/server/express/routes/api/geoip/route";
import { GET as start } from "@/server/express/routes/auth/start/route";
import { GET as status } from "@/server/express/routes/auth/status/route";
import { GET as complete } from "@/server/express/routes/auth/complete/route";
import { GET as callback } from "@/server/express/routes/auth/callback/[userFlow]/[serverId]/route";
import { GET as loginError } from "@/server/express/routes/auth/login/error/route";
import { GET as sessionRequired } from "@/server/express/routes/auth/session-required/route";
import { POST as prepare } from "@/server/express/routes/auth/prepare/route";
import { POST as mobile } from "@/server/express/routes/auth/mobile/login/route";
import { POST as s2s } from "@/server/express/routes/auth/s2s/signin/route";
import { POST as smsAuth } from "@/server/express/routes/sms/auth/route";
import { POST as smsToken } from "@/server/express/routes/sms/token/route";
import { POST as smsLog } from "@/server/express/routes/sms/log/route";
import { POST as simAuth } from "@/server/express/routes/ts43/auth/route";
import { POST as simToken } from "@/server/express/routes/ts43/token/route";
import { POST as simLog } from "@/server/express/routes/ts43/log/route";
import { POST as integrityAttempt } from "@/server/express/routes/api/play-integrity/attempt/route";
import { POST as integrityVerify } from "@/server/express/routes/api/play-integrity/verify/route";
import { POST as integrityToken } from "@/server/express/routes/api/play-integrity/token-exchange/route";
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
  app.set("view engine", "ejs");
  app.set("views", path.resolve("views"));
  app.use((req, res, next) => {
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
    res.render("pending"),
  );
  app.get("/auth/login", (_req, res) =>
    res.render("login"),
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
    res.render("qr-complete"),
  );
  app.get("/auth/error", authError);
  app.get("/user/info", userInfo);
  app.get("/auth/qrcode/error", qrError);
  return app;
}
