import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { exchangeMobileCode } from "./controller";

export const router = Router();
// This module has one operation: exchange a mobile authorization code for claims.
router.post("/auth/mobile/login", adapt(exchangeMobileCode));
