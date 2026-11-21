import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { exchangeMobileCode } from "./controller";

export const router = Router();
router.post("/auth/mobile/login", adapt(exchangeMobileCode));
