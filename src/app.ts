import { requestMiddleware } from "@/middleware/request";
import express from "express";
import path from "node:path";
import { userInfo, qrError, authError } from "@/modules/showcase/pages";
import { router as showcaseRouter } from "@/modules/showcase/routes";
import { router as browserauthRouter } from "@/modules/browser-auth/routes";
import { router as mobileRouter } from "@/modules/mobile/routes";
import { router as s2sRouter } from "@/modules/s2s/routes";
import { router as smsRouter } from "@/modules/sms/routes";
import { router as simRouter } from "@/modules/sim/routes";
import { router as playintegrityRouter } from "@/modules/play-integrity/routes";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.resolve("src/views"));
  app.use(requestMiddleware);
  app.use(showcaseRouter);
  app.use(browserauthRouter);
  app.use(mobileRouter);
  app.use(s2sRouter);
  app.use(smsRouter);
  app.use(simRouter);
  app.use(playintegrityRouter);
  app.get("/auth/pending", (_req, res) => res.render("showcase/pending"));
  app.get("/auth/login", (_req, res) => res.render("showcase/login"));
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
    res.render("showcase/qr-complete"),
  );
  app.get("/auth/error", authError);
  app.get("/user/info", userInfo);
  app.get("/auth/qrcode/error", qrError);
  return app;
}
