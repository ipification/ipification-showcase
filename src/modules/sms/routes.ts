import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { sendSmsCode, verifySmsCode } from "./controller";
import { diagnostics } from "@/shared/server/ciba/handlers";

export const router = Router();
// /auth starts the challenge; /token submits the OTP for exchange.
router.post("/sms/auth", adapt(sendSmsCode));
router.post("/sms/token", adapt(verifySmsCode));
router.post("/sms/log", adapt(diagnostics));
