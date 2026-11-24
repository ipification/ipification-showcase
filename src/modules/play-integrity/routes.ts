import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { handleIntegrity } from "./handlers";

export const router = Router();
// The Android flow must create an attempt, verify its token, then exchange signed state.
router.post(
  "/api/play-integrity/attempt",
  adapt((request) => handleIntegrity(request, "attempt")),
);
router.post(
  "/api/play-integrity/verify",
  adapt((request) => handleIntegrity(request, "verify")),
);
router.post(
  "/api/play-integrity/token-exchange",
  adapt((request) => handleIntegrity(request, "token-exchange")),
);
