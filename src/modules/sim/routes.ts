import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import {
  createSimCredentialRequest,
  exchangeSimCredential,
} from "./controller";
import { diagnostics } from "@/shared/server/ciba/handlers";

export const router = Router();
router.post("/ts43/auth", adapt(createSimCredentialRequest));
router.post("/ts43/token", adapt(exchangeSimCredential));
router.post("/ts43/log", adapt(diagnostics));
