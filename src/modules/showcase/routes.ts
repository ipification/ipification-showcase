import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { GET as root } from "./root";
import { GET as live } from "./live";
import { GET as ready } from "./ready";
import { GET as config } from "./config";
import { GET as geoip } from "./geoip";

export const router = Router();
router.get("/", adapt(root));
router.get("/health/live", adapt(live));
router.get("/health/ready", adapt(ready));
router.get("/api/config", adapt(config));
router.get("/api/geoip", adapt(geoip));
