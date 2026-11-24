import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { GET as root } from "./root";
import { GET as live } from "./live";
import { GET as ready } from "./ready";
import { GET as config } from "./config";
import { GET as geoip } from "./geoip";
import {
  renderAuthErrorPage,
  renderQrErrorPage,
  renderUserInfoPage,
} from "./pages";

export const router = Router();
// Login/bootstrap routes are mounted before static assets by src/app.ts.
router.get("/", adapt(root));
router.get("/health/live", adapt(live));
router.get("/health/ready", adapt(ready));
router.get("/api/config", adapt(config));
router.get("/api/geoip", adapt(geoip));
router.get("/auth/pending", (_req, res) => res.render("showcase/pending"));
router.get("/auth/login", (_req, res) => res.render("showcase/login"));

export const resultPagesRouter = Router();
// Result routes are mounted after static assets and render EJS views.
resultPagesRouter.get("/auth/qrcode/complete", (_req, res) =>
  res.render("showcase/qr-complete"),
);
resultPagesRouter.get("/auth/error", renderAuthErrorPage);
resultPagesRouter.get("/user/info", renderUserInfoPage);
resultPagesRouter.get("/auth/qrcode/error", renderQrErrorPage);
