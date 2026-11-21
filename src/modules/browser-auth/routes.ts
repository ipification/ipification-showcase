import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import {
  prepareWebAuthentication,
  startWebAuthentication,
  getAuthenticationStatus,
  completeWebAuthentication,
  handleAuthorizationCallback,
} from "./web";
import { GET as loginError } from "./login-error";
import { GET as sessionRequired } from "./session-required";

export const router = Router();
router.get("/auth/start", adapt(startWebAuthentication));
router.get("/auth/status", adapt(getAuthenticationStatus));
router.get("/auth/complete", adapt(completeWebAuthentication));
router.get("/auth/login/error", adapt(loginError));
router.get("/auth/session-required", adapt(sessionRequired));
router.post("/auth/prepare", adapt(prepareWebAuthentication));
router.get("/auth/callback/:userFlow/:serverId", (req, res) =>
  adapt((request) =>
    handleAuthorizationCallback(request, {
      userFlow: String(req.params.userFlow),
      serverId: String(req.params.serverId),
    }),
  )(req, res),
);
