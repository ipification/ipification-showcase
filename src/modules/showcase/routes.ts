import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { GET as root } from "./root";
import { GET as live } from "./live";
import { GET as ready } from "./ready";
import { GET as config } from "./config";
import { GET as geoip } from "./geoip";
import { authError, qrError, userInfo } from "./pages";

export const router = Router();
router.get("/", adapt(root));
router.get("/health/live", adapt(live));
router.get("/health/ready", adapt(ready));
router.get("/api/config", adapt(config));
router.get("/api/geoip", adapt(geoip));
router.get("/auth/pending", (_req, res) => res.render("showcase/pending"));
router.get("/auth/login", (_req, res) => res.render("showcase/login"));

export const resultPagesRouter = Router();
resultPagesRouter.get("/auth/qrcode/complete", (_req, res) =>
  res.render("showcase/qr-complete"),
);
resultPagesRouter.get("/auth/error", authError);
resultPagesRouter.get("/user/info", userInfo);
resultPagesRouter.get("/auth/qrcode/error", qrError);
