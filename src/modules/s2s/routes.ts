import { Router } from "express";
import { adapt } from "@/shared/server/express/adapt";
import { POST as readResult } from "./controller";

export const router = Router();
// Backend clients read the claims saved by the browser callback through this endpoint.
router.post("/auth/s2s/signin", adapt(readResult));
